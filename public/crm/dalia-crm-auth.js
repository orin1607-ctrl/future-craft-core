/**
 * CRM — auth bridge from Dalia React shell (same as marketing)
 */
(function () {
  'use strict';
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === 'dalia-coco-auth') {
      window.COCO_STAGING = e.data;
      if (window.DaliaCrm && DaliaCrm.onAuth) DaliaCrm.onAuth();
    }
    if (e.data.type === 'dalia-coco-open-customer' && e.data.customerId) {
      if (window.DaliaCrm && DaliaCrm.openCustomerById) DaliaCrm.openCustomerById(e.data.customerId);
    }
  });
})();
