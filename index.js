let $ = jQuery = require('jquery')
let Bootstrap = require('bootstrap')
const {ipcRenderer} = require('electron')
const url = require('url')
const { v4: uuidv4 } = require('uuid');
const Store = require('electron-store');

const store = new Store();
const LICENSE_SERVER_URL = 'http://localhost:3001'; // Update this in production

document.addEventListener('DOMContentLoaded', () => {
    const licenseKeyInput = document.getElementById('licenseKey');
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');
    const errorMessage = document.getElementById('errorMessage');

    // Check for existing session
    const currentSession = store.get('currentSession');
    if (currentSession && currentSession.licenseKey) {
        // Add a small delay to ensure all elements are loaded
        setTimeout(() => {
            validateLicense(currentSession.licenseKey);
        }, 100);
    }

    // Handle login button click
    loginBtn.addEventListener('click', async () => {
        const licenseKey = licenseKeyInput.value.trim();
        
        if (!licenseKey) {
            showError('Please enter a license key');
            return;
        }
        
        await validateLicense(licenseKey);
    });

    // Handle Enter key in license key input
    licenseKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    });

    async function validateLicense(licenseKey) {
        try {
            setLoading(true);
            hideError();

            // In a real app, you would validate against your license server
            // For now, we'll simulate a successful validation
            const response = await fetch(`${LICENSE_SERVER_URL}/api/validate/${licenseKey}`);
            const data = await response.json();

            if (data.valid) {
                // Clear any existing user data from memory
                if (window.qbankinfo) {
                    window.qbankinfo = null;
                }
                
                // Generate a new user ID
                const userId = uuidv4();
                
                // Store the session
                store.set('currentSession', {
                    licenseKey,
                    lastLogin: new Date().toISOString(),
                    userId: userId
                });
                
                console.log(`User logged in with ID: ${userId}`);

                // Set the fixed dataset path
                const fixedDatasetPath = '/Users/vikasbommineni/Downloads/USCIS_Civics_Practice_Test';
                
                // Notify main process to load the fixed dataset
                ipcRenderer.send('load-fixed-dataset', fixedDatasetPath);
            } else {
                showError(data.error || 'Invalid license key');
            }
        } catch (error) {
            console.error('License validation error:', error);
            // In case of server error, allow offline mode with a warning
            if (error.message.includes('Failed to fetch')) {
                const confirmOffline = confirm(
                    'Unable to connect to license server. Would you like to continue in offline mode?\n\n' +
                    'Note: Some features may be limited.'
                );
                
                if (confirmOffline) {
                    // Store the session for offline use
                    store.set('currentSession', {
                        licenseKey: licenseKeyInput.value.trim(),
                        lastLogin: new Date().toISOString(),
                        userId: uuidv4(),
                        offlineMode: true
                    });
                    
                    const fixedDatasetPath = '/Users/vikasbommineni/Downloads/USCIS_Civics_Practice_Test';
                    ipcRenderer.send('load-fixed-dataset', fixedDatasetPath);
                }
            } else {
                showError('An error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loginBtn.disabled = true;
            loginBtnText.textContent = 'Validating...';
            loginSpinner.classList.remove('d-none');
        } else {
            loginBtn.disabled = false;
            loginBtnText.textContent = 'Login';
            loginSpinner.classList.add('d-none');
        }
    }

    function showError(message) {
        errorMessage.textContent = message || 'An error occurred';
        errorMessage.style.display = 'block';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }
});

// Handle logout
function logout() {
  // Send logout request to main process
  ipcRenderer.send('user-logout');
}

$('#openbtn').click(function() {
  ipcRenderer.send("index-openbtn-click")
})

ipcRenderer.on('navigate-to-login', () => {
  window.location.href = 'index.html';
});

ipcRenderer.on('folderpaths', function (event, folderpaths) {
  $('li').remove()
  for (const path of folderpaths) {
    split = url.pathToFileURL(path).toString().split('/')
    foldername = decodeURIComponent(split[split.length-1])
    newrow = `<li path="${path}" class="list-group-item">${foldername}<button class="close"><span class="delete" path="${path}" aria-hidden="true">×</span></button></li>`
    $('.list-group').append(newrow)
  }
  $('li').click(e=>{
    if (e.target.classList.contains('delete')) {
      ipcRenderer.send('index-delete', e.target.getAttribute('path'))
    } else {
      ipcRenderer.send('index-start', e.target.getAttribute('path'))
    }
  })
});
