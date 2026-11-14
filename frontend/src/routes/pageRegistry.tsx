import React from 'react'
import ProjectsListPage from '../pages/projects/ProjectsListPage'
import ProjectFormPage from '../pages/projects/ProjectFormPage'
import ProjectDetailsPage from '../pages/projects/ProjectDetailsPage'
import DocumentsListPage from '../pages/documents/DocumentsListPage'
import DocumentNewPage from '../pages/documents/DocumentNewPage'
import DocumentEditorPage from '../pages/documents/DocumentEditorPage'
import DocumentVersionsPage from '../pages/documents/DocumentVersionsPage'
import ArchivePage from '../pages/documents/ArchivePage'
import DocumentImportPage from '../pages/documents/DocumentImportPage'
import DocumentValidationPage from '../pages/documents/DocumentValidationPage'
import DocumentPreviewPage from '../pages/documents/DocumentPreviewPage'
import DocumentExportPage from '../pages/documents/DocumentExportPage'
import SchemasAdminPage from '../pages/admin/SchemasAdminPage'
import type { Role } from '../shared/types'

/** Real pages by route key. Routes missing here still render the placeholder. */
export function pageFor(key: string, params: Record<string, string | undefined>, role: Role): React.ReactNode | undefined {
  switch (key) {
    case 'projects':
      return <ProjectsListPage role={role} />
    case 'projectNew':
      return <ProjectFormPage key="new" />
    case 'projectEdit':
      return <ProjectFormPage key={params.id} id={params.id} />
    case 'projectDetails':
      return <ProjectDetailsPage key={params.id} id={params.id!} role={role} />
    case 'documents':
      return <DocumentsListPage role={role} />
    case 'archive':
      return <ArchivePage role={role} />
    case 'documentNew':
      return <DocumentNewPage />
    case 'documentImport':
      return <DocumentImportPage />
    case 'documentEditor':
      return <DocumentEditorPage key={params.id} id={params.id!} />
    case 'documentVersions':
      return <DocumentVersionsPage key={params.id} id={params.id!} role={role} />
    case 'documentValidation':
      return <DocumentValidationPage key={params.id} id={params.id!} role={role} />
    case 'documentPreview':
      return <DocumentPreviewPage key={params.id} id={params.id!} />
    case 'documentExport':
      return <DocumentExportPage key={params.id} id={params.id!} role={role} />
    case 'adminSchemas':
      return <SchemasAdminPage />
    default:
      return undefined
  }
}
