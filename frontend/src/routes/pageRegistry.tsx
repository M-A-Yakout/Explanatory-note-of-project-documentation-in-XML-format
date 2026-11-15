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
import DashboardHome from '../pages/home/DashboardHome'
import ProfilePage from '../pages/home/ProfilePage'
import NotificationsPage from '../pages/home/NotificationsPage'
import AdminOverviewPage from '../pages/admin/AdminOverviewPage'
import UsersAdminPage from '../pages/admin/UsersAdminPage'
import OrganizationsAdminPage from '../pages/admin/OrganizationsAdminPage'
import AuditPage from '../pages/admin/AuditPage'
import SettingsPage from '../pages/admin/SettingsPage'
import SchemasAdminPage from '../pages/admin/SchemasAdminPage'
import type { Role } from '../shared/types'

/** Real pages by route key. Routes missing here still render the placeholder. */
export function pageFor(key: string, params: Record<string, string | undefined>, role: Role, name = ''): React.ReactNode | undefined {
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
    case 'dashboard':
      return <DashboardHome role={role} name={name} />
    case 'profile':
      return <ProfilePage />
    case 'notifications':
      return <NotificationsPage role={role} />
    case 'adminDashboard':
      return <AdminOverviewPage role={role} />
    case 'adminUsers':
      return <UsersAdminPage role={role} />
    case 'adminOrgs':
      return <OrganizationsAdminPage />
    case 'adminAudit':
      return <AuditPage role={role} />
    case 'adminSettings':
      return <SettingsPage />
    case 'adminSchemas':
      return <SchemasAdminPage />
    default:
      return undefined
  }
}
