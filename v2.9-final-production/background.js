let logBuffer = [];

// Hydrate logBuffer on service worker startup
chrome.storage.local.get(['executionLogs'], (data) => {
    if (data.executionLogs && Array.isArray(data.executionLogs)) {
        logBuffer = data.executionLogs;
    }
});

async function broadcastLog(msg) {
    console.log(msg);
    logBuffer.push(msg);
    if (logBuffer.length > 50) logBuffer.shift();
    
    chrome.storage.local.set({ executionLogs: logBuffer });
    chrome.runtime.sendMessage({ type: 'LOG', message: msg }).catch(() => {});
}

// MV3 Keep-Alive Ping Handler
let keepAliveInterval = null;
function startKeepAlive() {
    if (keepAliveInterval) return;
    keepAliveInterval = setInterval(() => {
        chrome.runtime.getPlatformInfo(() => {});
    }, 20000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

async function createTempMail() {
    broadcastLog('[+] Fetching mail.tm domains...');
    try {
        const domainRes = await fetch('https://api.mail.tm/domains');
        if (domainRes.status === 429) {
            throw new Error('Rate limit hit (429 Too Many Requests) on mail.tm. Wait a few minutes.');
        }
        const domains = await domainRes.json();
        
        if (!domains['hydra:member'] || domains['hydra:member'].length === 0) {
            throw new Error('Mail domains list is empty or API failed.');
        }
        
        const domain = domains['hydra:member'][0].domain;
        const username = 'grn_' + Math.random().toString(36).substring(2, 8);
        const password = Math.random().toString(36).substring(2, 10) + 'A1@!';
        const address = `${username}@${domain}`;

        const regRes = await fetch('https://api.mail.tm/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });

        if (regRes.status === 429) {
            throw new Error('Rate limit hit (429) when provisioning mail account.');
        }
        if (!regRes.ok) throw new Error(`Failed to create mail account: ${regRes.statusText}`);

        const tokenRes = await fetch('https://api.mail.tm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        const tokenData = await tokenRes.json();

        const mailData = { address, password, token: tokenData.token, username };
        
        const storage = await chrome.storage.local.get({ savedAccounts: [] });
        storage.savedAccounts.push(mailData);
        await chrome.storage.local.set({ savedAccounts: storage.savedAccounts });

        broadcastLog(`[+] Mail provisioned and state stacked: ${address}`);
        return mailData;
    } catch (err) {
        broadcastLog(`[-] Mail error: ${err.message}`);
        throw err;
    }
}

async function fetchVerificationCode(token) {
    broadcastLog('[+] Polling inbox for OTP verification code...');
    
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 4000));
        try {
            const msgRes = await fetch('https://api.mail.tm/messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (msgRes.status === 401) {
                broadcastLog('[-] Mail.tm token expired (401 Unauthorized).');
                throw new Error('Mail token expired');
            }

            const msgData = await msgRes.json();
            if (msgData['hydra:member'] && msgData['hydra:member'].length > 0) {
                const msgId = msgData['hydra:member'][0].id;
                const fullMsgRes = await fetch(`https://api.mail.tm/messages/${msgId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const fullMsg = await fullMsgRes.json();
                
                const cleanText = (fullMsg.text || '').replace(/\s+/g, '');
                const match = cleanText.match(/(?:mã|code|otp|xácminh)[^\d]*(\d{4,6})/i);
                if (match && match[1]) {
                    return match[1];
                }
            }
        } catch (e) {
            if (e.message === 'Mail token expired') throw e;
        }
    }
    throw new Error('Timeout waiting for valid OTP code email.');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_REGISTRATION') {
        sendResponse({ status: 'Started in background' });
        
        (async () => {
            logBuffer = ['[+] Starting new automation sequence...'];
            chrome.storage.local.set({ executionLogs: logBuffer });

            startKeepAlive();
            let currentTabId = null;
            let isSuccess = false;

            try {
                const mail = await createTempMail();
                
                const tab = await chrome.tabs.create({ 
                    url: 'https://sso.garena.com/universal/register?app_id=10100&locale=vi-VN' 
                });
                currentTabId = tab.id;

                await new Promise((resolve) => {
                    const listener = (tabId, changeInfo) => {
                        if (tabId === tab.id && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });

                broadcastLog('[+] Waiting for form DOM hydration across all frames...');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: () => {
                        return new Promise((resolve) => {
                            if (!document.body || document.body.innerHTML.length < 100) return resolve(false);
                            if (document.querySelector('#username') || document.querySelector('input[name*="username"]')) return resolve(true);
                            
                            const observer = new MutationObserver(() => {
                                if (document.querySelector('#username') || document.querySelector('input[name*="username"]')) {
                                    observer.disconnect();
                                    resolve(true);
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                            setTimeout(() => { observer.disconnect(); resolve(false); }, 15000);
                        });
                    }
                });

                broadcastLog('[+] Injecting credentials with native React setter handlers...');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    args: [mail.username, mail.address, mail.password],
                    func: (user, email, pwd) => {
                        if (!document.body || document.body.innerHTML.length < 100) return;
                        
                        const setNativeValue = (el, value) => {
                            if (!el) return;
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLInputElement.prototype, "value"
                            ).set;
                            nativeInputValueSetter.call(el, value);
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        };

                        const userEl = document.querySelector('#username') || document.querySelector('input[name*="username"]');
                        const emailEl = document.querySelector('#email') || document.querySelector('input[name*="email"]');
                        const passEl = document.querySelector('#password') || document.querySelector('input[name*="password"]');
                        const repassEl = document.querySelector('#repassword') || document.querySelector('input[name*="repassword"]');

                        setNativeValue(userEl, user);
                        setNativeValue(emailEl, email);
                        setNativeValue(passEl, pwd);
                        setNativeValue(repassEl, pwd);
                    }
                });

                broadcastLog('[!] Form populated. Complete Captcha challenge manually in tab.');

                const captchaResults = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: () => {
                        return new Promise((resolve) => {
                            if (!document.body || document.body.innerHTML.length < 100) return resolve(false);
                            
                            let observer;
                            const checkToken = () => {
                                const selectors = [
                                    'textarea[name="g-recaptcha-response"]', 
                                    'input[name="g-recaptcha-response"]',
                                    'textarea[name="cf-turnstile-response"]',
                                    'input[name="cf-turnstile-response"]'
                                ];
                                let captchaEl = null;
                                for (const sel of selectors) {
                                    const el = document.querySelector(sel);
                                    if (el && el.value && el.value.length > 20) {
                                        captchaEl = el;
                                        break;
                                    }
                                }
                                if (captchaEl) {
                                    if (observer) observer.disconnect();
                                    const submitBtn = document.querySelector('button[type="submit"]') || document.querySelector('.submit-btn');
                                    if (submitBtn) { 
                                        submitBtn.click(); 
                                        resolve('Form submitted'); 
                                    }
                                }
                            };

                            checkToken();
                            observer = new MutationObserver(() => checkToken());
                            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
                            
                            setTimeout(() => { if (observer) observer.disconnect(); resolve('Timeout'); }, 120000);
                        });
                    }
                });

                const isSubmitted = captchaResults.some(res => res.result === 'Form submitted');
                if (!isSubmitted) {
                    throw new Error('CAPTCHA timeout. User did not solve the challenge.');
                }

                broadcastLog('[+] Form submitted. Waiting for verification email...');
                const otpCode = await fetchVerificationCode(mail.token);
                
                const storage = await chrome.storage.local.get({ savedAccounts: [] });
                const updatedList = storage.savedAccounts.map(acc => 
                    acc.address === mail.address ? { ...acc, otp: otpCode } : acc
                );
                await chrome.storage.local.set({ savedAccounts: updatedList });
                
                broadcastLog(`[★] SUCCESS! Got OTP: ${otpCode}. Waiting for OTP page to load...`);

                await new Promise((resolve) => {
                    let isResolved = false;
                    let timeoutId = setTimeout(() => {
                        if (!isResolved) { isResolved = true; resolve(); }
                    }, 15000);

                    const listener = (tabId, changeInfo) => {
                        if (tabId === tab.id && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            clearTimeout(timeoutId);
                            setTimeout(() => {
                                if (!isResolved) { isResolved = true; resolve(); }
                            }, 1500); 
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });

                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        args: [otpCode],
                        func: (otp) => {
                            return new Promise((resolve) => {
                                if (!document.body || document.body.innerHTML.length < 100) return resolve(false);

                                const fillOtp = () => {
                                    const otpInputs = document.querySelectorAll('input[name*="otp"], #otp, .otp-input');
                                    if (otpInputs.length === 0) return false;

                                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

                                    if (otpInputs.length === 1) {
                                        nativeInputValueSetter.call(otpInputs[0], otp);
                                        otpInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                                        otpInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                                    } else {
                                        for (let i = 0; i < otp.length && i < otpInputs.length; i++) {
                                            nativeInputValueSetter.call(otpInputs[i], otp[i]);
                                            otpInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                                            otpInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                    }
                                    
                                    setTimeout(() => {
                                        const confirmBtn = document.querySelector('button[type="submit"]');
                                        if (confirmBtn) confirmBtn.click();
                                        resolve('OTP Injected');
                                    }, 1000);
                                    return true;
                                };

                                if (fillOtp()) return;
                                
                                const observer = new MutationObserver(() => {
                                    if (fillOtp()) observer.disconnect();
                                });
                                observer.observe(document.body, { childList: true, subtree: true });
                                setTimeout(() => { observer.disconnect(); resolve('OTP Timeout'); }, 15000);
                            });
                        }
                    });
                    broadcastLog(`[★★★] REGISTRATION COMPLETE! Email: ${mail.address} | Pass: ${mail.password} | OTP: ${otpCode}`);
                    isSuccess = true;
                } catch (e) {
                    broadcastLog(`[-] OTP Auto-fill failed: ${e.message}. Please fill manually.`);
                }

            } catch (err) {
                broadcastLog(`[-] Fatal execution error: ${err.message}`);
            } finally {
                stopKeepAlive();
                if (currentTabId && isSuccess) {
                    chrome.tabs.remove(currentTabId).catch(() => {});
                } else if (currentTabId) {
                    broadcastLog(`[!] Execution stopped or failed. Tab left open for inspection.`);
                }
            }
        })();
    }
    return true;
});
