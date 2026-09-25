// MedicalAutoFill Tool - Site scripts
(function() {
    'use strict';
    
    // Auto-dismiss alerts after 5 seconds
    document.querySelectorAll('.alert-dismissible').forEach(function(el) {
        setTimeout(function() {
            var btn = el.querySelector('.btn-close');
            if (btn) btn.click();
        }, 5000);
    });
    
})();