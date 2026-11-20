import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Requirement, RootConfig } from '../src/model.ts'
import { trace } from '../src/trace.ts'

const config: RootConfig = { specai: '0.2', areas: ['loans'], components: [{ name: 'Library.API' }] }
const req = (id: string, tests: string[]): Requirement => ({
  specai: '0.2',
  id,
  title: id,
  status: 'approved',
  statement: 'The service shall work.',
  components: ['Library.API'],
  tests: tests.map((t) => ({ id: t, title: t, status: 'proposed', level: 'unit', when: 'x', then: ['y'] })),
})
const loans = [req('LOAN-001', ['LOAN-001-T1', 'LOAN-001-T2', 'LOAN-001-T3'])]

function checkouts(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'specai-pytest-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const suite = `import pytest
from pytest import mark


@pytest.mark.specai("LOAN-001-T1")
def test_sixth_loan_is_refused():
    pass


class TestOverdue:
    @mark.specai('LOAN-001-T2')
    @pytest.mark.parametrize("days", [
        1,
        30,
    ])
    async def test_blocks_borrowing(self, days):
        def test_nested_helper():
            pass

    def test_untagged_method(self):
        pass


class Helper:
    def test_not_a_test(self):
        pass


def helper():
    pass


def test_untagged_function():
    pass
`

describe('pytest', () => {
  it('[CLI-022-T1] finds specai markers on test functions and methods, with file and line', () => {
    const result = trace(config, loans, checkouts({ 'Library.API/tests/test_loans.py': suite }))
    expect(result.links['LOAN-001-T1']).toEqual([{ testId: 'LOAN-001-T1', file: 'Library.API/tests/test_loans.py', line: 5, framework: 'pytest' }])
    expect(result.links['LOAN-001-T2']).toEqual([{ testId: 'LOAN-001-T2', file: 'Library.API/tests/test_loans.py', line: 11, framework: 'pytest' }])
    expect(result.multiple).toEqual([])
  })

  it('[CLI-022-T2] lists untagged tests as pytest finds them by default', () => {
    const result = trace(config, loans, checkouts({ 'Library.API/tests/loans_test.py': suite, 'Library.API/app/test_data.txt': 'def test_x(): pass\n' }))
    expect(result.untagged['Library.API'].map((t) => `${t.line} ${t.name}`)).toEqual(['20 TestOverdue::test_untagged_method', '33 test_untagged_function'])
  })

  it('[CLI-022-T3] reports a test with two specai markers', () => {
    const text = '@pytest.mark.specai("LOAN-001-T1")\n@pytest.mark.specai("LOAN-001-T3")\ndef test_both():\n    pass\n'
    expect(trace(config, loans, checkouts({ 'Library.API/test_both.py': text })).multiple).toEqual([
      { file: 'Library.API/test_both.py', line: 3, framework: 'pytest', testIds: ['LOAN-001-T1', 'LOAN-001-T3'] },
    ])
  })

  it('reads implementation annotations in Python source but not in pytest files', () => {
    const result = trace(config, loans, checkouts({ 'Library.API/app/loans.py': '# SpecAI: LOAN-001\ndef borrow():\n    pass\n', 'Library.API/tests/test_x.py': '# SpecAI: LOAN-009\n' }))
    expect(result.implementations['LOAN-001']).toEqual([{ requirementId: 'LOAN-001', file: 'Library.API/app/loans.py', line: 1 }])
    expect(result.unknownAnnotations).toEqual([])
  })

  it('ignores Python files that are not pytest test files', () => {
    const result = trace(config, loans, checkouts({ 'Library.API/app/fixtures.py': '@pytest.mark.specai("LOAN-001-T1")\ndef test_x():\n    pass\n' }))
    expect(result.links['LOAN-001-T1']).toEqual([])
    expect(result.untagged['Library.API']).toEqual([])
  })
})
