// iOS "Add to Home Screen" install prompt
// Shows a banner on iPhone/iPad when not already running as a Web Clip

(function () {
    function isIOS() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent);
    }

    function isStandalone() {
        return window.navigator.standalone === true;
    }

    function wasDismissed() {
        return localStorage.getItem('installPromptDismissed') === '1';
    }

    if (!isIOS() || isStandalone() || wasDismissed()) return;

    window.addEventListener('load', function () {
        var banner = document.createElement('div');
        banner.id = 'ios-install-banner';
        banner.style.cssText = [
            'position:fixed',
            'bottom:20px',
            'left:50%',
            'transform:translateX(-50%)',
            'background:#1a1a1a',
            'color:#fff',
            'padding:14px 18px',
            'border-radius:14px',
            'font-size:14px',
            'line-height:1.4',
            'text-align:center',
            'z-index:9999',
            'max-width:300px',
            'width:calc(100% - 40px)',
            'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif'
        ].join(';');

        banner.innerHTML =
            '<div style="margin-bottom:6px;font-size:16px;">Add to Home Screen</div>' +
            '<div style="color:#ccc;">Tap <strong style="color:#fff;">Share</strong> ' +
            'then <strong style="color:#fff;">&#8220;Add to Home Screen&#8221;</strong> ' +
            'to install this app.</div>' +
            '<button id="ios-install-dismiss" style="' +
                'display:block;margin:10px auto 0;background:#444;border:none;' +
                'color:#fff;padding:5px 16px;border-radius:8px;font-size:13px;cursor:pointer;' +
            '">Dismiss</button>';

        document.body.appendChild(banner);

        document.getElementById('ios-install-dismiss').addEventListener('click', function () {
            localStorage.setItem('installPromptDismissed', '1');
            banner.remove();
        });
    });
})();
