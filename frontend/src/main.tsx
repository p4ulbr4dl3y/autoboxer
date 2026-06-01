import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import AppLayout from './layouts/AppLayout.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import ProjectGalleryPage from './pages/ProjectGalleryPage.tsx'
import EditorPage from './pages/EditorPage.tsx'

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'projects/:projectId', element: <ProjectGalleryPage /> },
          { path: 'projects/:projectId/images/:imageId', element: <EditorPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
