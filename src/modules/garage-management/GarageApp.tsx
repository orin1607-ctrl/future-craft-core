import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { GarageProvider } from './store';
import {
  CompanyPickScreen,
  ExistingCustomerScreen,
  HomeScreen,
  NewCustomerScreen,
  OpenCaseScreen,
  QuoteSearchScreen,
  ApprovedQuoteScreen,
  VehicleScreen,
} from './HomeOpen';
import {
  CaseHubScreen,
  CommunicationScreen,
  CompanyWorkDetailsScreen,
  CompleteScreen,
  DamageMapScreen,
  GalleryScreen,
  HistoryScreen,
  InspectionScreen,
  IntakeScreen,
  QuoteScreen,
  QuoteSendScreen,
  ShareScreen,
  WorkOrderScreen,
} from './CaseScreens';
import './garage.css';

function QuoteByParam() {
  const { caseId = '' } = useParams();
  return <ApprovedQuoteScreen caseId={caseId} />;
}

export default function GarageApp() {
  return (
    <GarageProvider>
      <div className="gm-root" dir="rtl">
        <div className="gm-stage">
          <Routes>
            <Route index element={<HomeScreen />} />
            <Route path="open" element={<OpenCaseScreen />} />
            <Route path="open/existing" element={<ExistingCustomerScreen />} />
            <Route path="open/new" element={<NewCustomerScreen />} />
            <Route path="open/company" element={<CompanyPickScreen />} />
            <Route path="open/company-work" element={<CompanyWorkDetailsScreen />} />
            <Route path="open/vehicle" element={<VehicleScreen />} />
            <Route path="quotes" element={<QuoteSearchScreen />} />
            <Route path="quotes/:caseId" element={<QuoteByParam />} />
            <Route path="cases/:caseId" element={<CaseHubScreen />} />
            <Route path="cases/:caseId/inspect" element={<InspectionScreen />} />
            <Route path="cases/:caseId/map" element={<DamageMapScreen />} />
            <Route path="cases/:caseId/quote" element={<QuoteScreen />} />
            <Route path="cases/:caseId/quote/send" element={<QuoteSendScreen />} />
            <Route path="cases/:caseId/order" element={<WorkOrderScreen />} />
            <Route path="cases/:caseId/gallery" element={<GalleryScreen />} />
            <Route path="cases/:caseId/comm" element={<CommunicationScreen />} />
            <Route path="cases/:caseId/share" element={<ShareScreen />} />
            <Route path="cases/:caseId/intake" element={<IntakeScreen />} />
            <Route path="cases/:caseId/history" element={<HistoryScreen />} />
            <Route path="cases/:caseId/complete" element={<CompleteScreen />} />
            <Route path="*" element={<Navigate to="/garage-management" replace />} />
          </Routes>
        </div>
      </div>
    </GarageProvider>
  );
}
