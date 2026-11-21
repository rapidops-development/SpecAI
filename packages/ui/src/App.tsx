import { useSpecIndex } from './api.ts'
import { Layout } from './components/Layout.tsx'
import { SpecProvider } from './components/SpecContext.tsx'
import { AreaPage } from './pages/AreaPage.tsx'
import { GlossaryPage, TermPage } from './pages/GlossaryPages.tsx'
import { ListPage } from './pages/ListPage.tsx'
import { ProblemsPage } from './pages/ProblemsPage.tsx'
import { RawFileEditor } from './pages/RawFileEditor.tsx'
import { RequirementEditor } from './pages/RequirementEditor.tsx'
import { Missing, RequirementPage } from './pages/RequirementPage.tsx'
import { TermEditor } from './pages/TermEditor.tsx'
import { navigate, parseRoute, useLocation } from './router.tsx'
import { Announcer } from './components/Announcer.tsx'

export function App() {
  const { index, error, connection } = useSpecIndex()
  const { pathname, search } = useLocation()
  if (!index) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        {error ? (
          <>
            <h1 className="font-serif text-2xl font-semibold">Can’t load the specs</h1>
            <p className="text-muted mt-2">{error}. Check that <code className="inline">specai serve</code> is still running, then reload.</p>
          </>
        ) : (
          <p className="text-muted">Loading specs</p>
        )}
      </main>
    )
  }
  const route = parseRoute(pathname, search)
  return (
    <SpecProvider index={index}>
      <Layout route={route} connection={connection}>
        {route.page === 'list' && <ListPage search={search} />}
        {route.page === 'requirement' && <RequirementPage id={route.id} search={search} />}
        {route.page === 'area' && <AreaPage folder={route.folder} search={search} />}
        {route.page === 'glossary' && <GlossaryPage />}
        {route.page === 'term' && <TermPage slug={route.slug} />}
        {route.page === 'problems' && <ProblemsPage />}
        {route.page === 'edit-requirement' && <RequirementEditor id={route.id} />}
        {route.page === 'new-requirement' && <RequirementEditor area={route.folder} />}
        {route.page === 'edit-term' && <TermEditor slug={route.slug} />}
        {route.page === 'new-term' && <TermEditor />}
        {route.page === 'file' && <RawFileEditor path={route.path} onDone={() => navigate('/problems')} doneLabel="Back to problems" />}
        {route.page === 'not-found' && <Missing what="page here" />}
      </Layout>
      <Announcer />
    </SpecProvider>
  )
}
