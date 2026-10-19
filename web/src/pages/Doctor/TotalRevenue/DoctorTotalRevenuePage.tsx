import React, { useEffect } from 'react';
import { AdminTotalRevenuePage } from '../../Admin/AnalyticsRevenue/AnalyticsRevenuePage';

/**
 * Doctor Total Revenue Page
 * Connected directly to the centralized Live Revenue & Analytics Dashboard (http://localhost:3000/revenue)
 * Provides real-time Firestore sync across all transactions, ledger, and visual analytics.
 */
export const DoctorTotalRevenuePage: React.FC = () => {
  useEffect(() => {
    if (window.location.pathname !== '/revenue') {
      window.history.pushState({}, '', '/revenue');
    }
  }, []);

  return <AdminTotalRevenuePage />;
};

export default DoctorTotalRevenuePage;
