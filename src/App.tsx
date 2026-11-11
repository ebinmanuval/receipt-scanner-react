import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ScansPage } from '@/pages/scans/ScansPage'
import { ScanUploadPage } from '@/pages/scans/ScanUploadPage'
import { ScanReviewPage } from '@/pages/scans/ScanReviewPage'
import { ReceiptsPage } from '@/pages/receipts/ReceiptsPage'
import { ReceiptDetailPage } from '@/pages/receipts/ReceiptDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="scans" element={<ScansPage />} />
          <Route path="scans/upload" element={<ScanUploadPage />} />
          <Route path="scans/:id" element={<ScanReviewPage />} />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="receipts/:id" element={<ReceiptDetailPage />} />
          <Route path="bank/import" element={<PlaceholderPage title="Import statements" phase={3} />} />
          <Route path="bank/transactions" element={<PlaceholderPage title="Bank transactions" phase={3} />} />
          <Route path="reconcile" element={<PlaceholderPage title="Reconcile" phase={3} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
