// src/features/claims/ClaimsReportsIntegratedView.tsx
/**
 * Integrated Claims & Financial Reports Center Hub for Dalia.
 * Directly renders the 7-Tab Financial & Operational Reports Center.
 */
import React from 'react';
import type { ClaimRecord } from './claimsConstants';
import type { GarageCaseRecord } from './ClaimsReportsView';
import ClaimsFinancialCenterView from './ClaimsFinancialCenterView';
import './claim-quote.css';

export interface ClaimsReportsIntegratedViewProps {
  claims: ClaimRecord[];
  garageCases: GarageCaseRecord[];
  onBack: () => void;
  onOpenClaim: (id: string) => void;
  onOpenGarageCase: (id: string) => void;
  onOpenAiReports?: () => void;
}

export default function ClaimsReportsIntegratedView({
  claims,
  garageCases,
  onBack,
  onOpenClaim,
  onOpenGarageCase,
  onOpenAiReports,
}: ClaimsReportsIntegratedViewProps) {
  return (
    <div className="claims-reports-integrated" style={{ width: '100%', minWidth: 0 }}>
      <ClaimsFinancialCenterView
        claims={claims}
        garageCases={garageCases}
        onOpenClaim={onOpenClaim}
        onOpenGarageCase={onOpenGarageCase}
        onBack={onBack}
        onOpenAiReports={onOpenAiReports}
      />
    </div>
  );
}
