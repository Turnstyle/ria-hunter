## Plan: Integrate Website Form with Google Sheets via Google Apps Script

This plan outlines the steps to capture data from your website's waitlist form, validate it, and store it in a designated Google Sheet.

---

### 1. Google Sheet Preparation

1.  **Open your Google Sheet:** Access the "RIA Hunter Waitlist" sheet at the provided URL: `https://docs.google.com/spreadsheets/d/1CypmGPa8up_AX9s7XSuIZynXpN7-ZCZZSKeeLyHkkJE/edit`.
2.  **Define Columns:** Ensure the first row of your sheet contains the following headers, in the order you want the data to appear. This order must match the order used in the Apps Script later.
    * `Timestamp` (Recommended: The script will add this automatically)
    * `Full Name`
    * `Email Address`
    * `Phone Number`
    * `Company`
    * `Purpose`
3.  **Sharing:** No specific sharing changes are needed *for the script to work*, but ensure *you* have editor access. The script will run under your authority or as a web app with its own permissions. *Do not* make the sheet publicly editable.

---

### 2. Google Apps Script Setup

This script will act as the backend API endpoint that your website form will send data to.

1.  **Create the Script:**
    * Go to your Google Sheet.
    * Click `Extensions` > `Apps Script`.
    * A new Apps Script project will open. Give it a meaningful name (e.g., "RIA Hunter Waitlist Handler").
2.  **Write the Code:** Replace any existing code in the `Code.gs` file with the following:

    ```javascript
    /**
     * @license
     * Copyright Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     * https://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    // --- Configuration ---
    // IMPORTANT: Replace with the actual ID of YOUR Google Sheet.
    // You can find the ID in the URL: https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
    const SPREADSHEET_ID = '1CypmGPa8up_AX9s7XSuIZynXpN7-ZCZZSKeeLyHkkJE';
    // Replace with the name of the specific sheet (tab) within your spreadsheet.
    const SHEET_NAME = 'Sheet1'; // Or whatever your sheet is named.

    /**
     * Handles POST requests from the website form.
     * @param {Object} e - The event parameter containing the request data.
     * @return {ContentService.TextOutput} - JSON response indicating success or failure.
     */
    function doPost(e) {
      // Basic check to ensure it's a POST request with parameters
      if (!e || !e.parameter) {
        return createJsonResponse({ status: 'error', message: 'Invalid request.' });
      }

      const lock = LockService.getScriptLock();
      try {
        // Wait for up to 30 seconds for other processes to finish.
        lock.waitLock(30000);

        const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
        if (!sheet) {
           return createJsonResponse({ status: 'error', message: `Sheet "${SHEET_NAME}" not found.` });
        }

        // Extract data from the request parameters (these names must match your form's input names)
        const fullName = e.parameter.fullName || '';
        const email = e.parameter.email || '';
        const phone = e.parameter.phone || '';
        const company = e.parameter.company || ''; // Optional
        const purpose = e.parameter.purpose || '';
        const timestamp = new Date();

        // --- Server-Side Validation (Basic) ---
        if (!fullName || !email || !phone || !purpose) {
            return createJsonResponse({ status: 'error', message: 'Missing required fields.' });
        }
        if (!validateEmail(email)) {
            return createJsonResponse({ status: 'error', message: 'Invalid email format.' });
        }
        if (!validatePhone(phone)) {
            return createJsonResponse({ status: 'error', message: 'Invalid phone format (must be 10 digits).' });
        }
        // --- End Validation ---


        // Append data to the sheet in the specified order.
        // Ensure this order matches your Google Sheet columns.
        sheet.appendRow([
          timestamp,
          fullName,
          email,
          phone,
          company,
          purpose
        ]);

        return createJsonResponse({ status: 'success', message: 'Data received successfully.' });

      } catch (error) {
        Logger.log('Error: ' + error.toString());
        return createJsonResponse({ status: 'error', message: 'An internal error occurred: ' + error.toString() });

      } finally {
        lock.releaseLock();
      }
    }

    /**
     * Creates a JSON response object for the web app.
     * @param {Object} data - The data to include in the response.
     * @return {ContentService.TextOutput} - The JSON response.
     */
    function createJsonResponse(data) {
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /**
     * Basic email validation.
     * @param {string} email - The email to validate.
     * @return {boolean} - True if valid, false otherwise.
     */
    function validateEmail(email) {
        const re = /^\S+@\S+\.\S+$/;
        return re.test(String(email).toLowerCase());
    }

    /**
     * Basic phone validation (10 digits).
     * @param {string} phone - The phone number to validate.
     * @return {boolean} - True if valid, false otherwise.
     */
    function validatePhone(phone) {
        const re = /^\d{10}$/;
        // Remove non-digit characters before testing
        const digitsOnly = String(phone).replace(/\D/g, '');
        return re.test(digitsOnly);
    }
    ```

3.  **Save the Script:** Click the floppy disk icon (or `File` > `Save`).
4.  **Deploy as Web App:**
    * Click `Deploy` > `New deployment`.
    * Click the gear icon next to `Select type` and choose `Web app`.
    * **Description:** Add a description (e.g., "RIA Hunter Waitlist Form Handler v1").
    * **Execute as:** Choose `Me (your email address)`.
    * **Who has access:** Choose `Anyone`. **This is crucial.** It means *anyone* on the internet can *run* your script (send data to it), but they cannot *see* or *edit* the code. This is necessary for your website to communicate with it.
    * Click `Deploy`.
    * **Authorize Access:** You will likely be asked to review permissions. Click `Review permissions`, choose your Google account, click `Advanced` (if you see a "Google hasn't verified this app" screen), and then click `Go to [Your Script Name] (unsafe)`. Finally, click `Allow`. This allows the script to access your Google Sheets on your behalf.
    * **Copy the Web App URL:** Once deployment is complete, a `Web app URL` will be displayed. **Copy this URL carefully.** You will need it for your website's JavaScript code.
    * Click `Done`.
    * **Important:** If you make changes to the script later, you must create a *New deployment* or *Manage deployments* > *Edit* > *Create new version* for the changes to take effect on the Web App URL.

---

### 3. Frontend Implementation (Website Code)

You will need to modify your website's HTML and add JavaScript to handle the form submission and validation. Since you're using a framework or build process (GitHub to Vercel), integrate this into your existing codebase.

1.  **HTML Form Structure:**
    Ensure your form has `name` attributes that match the keys used in the Apps Script (`fullName`, `email`, `phone`, `company`, `purpose`). Add HTML5 validation attributes.

    ```html
    <form id="waitlistForm">
        <div>
            <label for="fullName">Full Name *</label>
            <input type="text" id="fullName" name="fullName" required>
        </div>
        <div>
            <label for="email">Email Address *</label>
            <input type="email" id="email" name="email" required>
        </div>
        <div>
            <label for="phone">Phone Number *</label>
            <input type="tel" id="phone" name="phone" required pattern="\d{10}" title="Please enter a 10-digit phone number">
        </div>
        <div>
            <label for="company">Company (Optional)</label>
            <input type="text" id="company" name="company">
        </div>
        <div>
            <label for="purpose">Your purpose for wanting early access *</label>
            <textarea id="purpose" name="purpose" required></textarea>
        </div>
        <div>
            <button type="submit" id="submitButton">Request Early Access</button>
            <button type="button" id="cancelButton">Cancel</button>
        </div>
        <div id="formMessage" style="margin-top: 15px; font-weight: bold;"></div>
    </form>
    ```

2.  **JavaScript for Validation and Submission:**
    Add a `<script>` tag to your HTML or include this in your existing JavaScript files. This code will:
    * Prevent the default form submission.
    * Perform client-side validation (enhances user experience, but *server-side in Apps Script is still important*).
    * Send the data to your Google Apps Script Web App URL using `Workspace`.
    * Display feedback to the user.

    ```javascript
    document.addEventListener('DOMContentLoaded', function () {
        const form = document.getElementById('waitlistForm');
        const submitButton = document.getElementById('submitButton');
        const formMessage = document.getElementById('formMessage');
        // --- IMPORTANT: Replace with YOUR Google Apps Script Web App URL ---
        const appsScriptUrl = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';

        form.addEventListener('submit', function (event) {
            event.preventDefault(); // Prevent default browser submission

            formMessage.textContent = ''; // Clear previous messages
            formMessage.style.color = 'black';
            submitButton.disabled = true; // Disable button during submission
            formMessage.textContent = 'Submitting...';

            // --- Client-Side Validation ---
            const name = document.getElementById('fullName').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const purpose = document.getElementById('purpose').value.trim();
            const company = document.getElementById('company').value.trim();

            if (!name || !email || !phone || !purpose) {
                showMessage('Please fill out all required fields.', 'red');
                submitButton.disabled = false;
                return;
            }

            const emailRegex = /^\S+@\S+\.\S+$/;
            if (!emailRegex.test(email)) {
                showMessage('Please enter a valid email address.', 'red');
                submitButton.disabled = false;
                return;
            }

            // Clean phone number (allow for common formats but send only digits)
            const phoneDigits = phone.replace(/\D/g, '');
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phoneDigits)) {
                showMessage('Please enter a valid 10-digit phone number.', 'red');
                submitButton.disabled = false;
                return;
            }
            // --- End Validation ---

            // Create a FormData object
            const formData = new FormData();
            formData.append('fullName', name);
            formData.append('email', email);
            formData.append('phone', phoneDigits); // Send only digits
            formData.append('company', company);
            formData.append('purpose', purpose);

            // Send data using Fetch API
            fetch(appsScriptUrl, {
                method: 'POST',
                body: formData,
                // mode: 'no-cors' // Use 'no-cors' if you encounter CORS issues,
                               // BUT be aware that you won't get a response back.
                               // The 'doPost' in Apps Script should handle CORS correctly
                               // by returning JSON, so try without 'no-cors' first.
            })
            .then(response => response.json()) // Try to parse the JSON response
            .then(data => {
                console.log('Apps Script Response:', data);
                if (data.status === 'success') {
                    showMessage('Thank you! Your request has been received.', 'green');
                    form.reset(); // Clear the form
                } else {
                    showMessage(`Error: ${data.message || 'Submission failed. Please try again.'}`, 'red');
                }
            })
            .catch(error => {
                console.error('Fetch Error:', error);
                showMessage('An error occurred. Please check your connection or try again later.', 'red');
            })
            .finally(() => {
                submitButton.disabled = false; // Re-enable the button
            });
        });

        function showMessage(message, color) {
            formMessage.textContent = message;
            formMessage.style.color = color;
        }
    });
    ```

3.  **Update `appsScriptUrl`:** Crucially, replace `'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL'` in the JavaScript with the actual URL you copied when deploying your Apps Script.

---

### 4. Deployment and Testing

1.  **Commit and Push:** Commit these HTML and JavaScript changes to your `jtpnexus-website` GitHub repository.
2.  **Vercel Deployment:** Vercel should automatically detect the push (if configured) and start a new deployment. Wait for it to complete.
3.  **Test:**
    * Navigate to `jtpnexus.com/ria-hunter`.
    * Try submitting the form *without* filling in required fields. Check if the HTML5 and JavaScript validation works.
    * Try entering an invalid email or phone number. Check validation.
    * Fill out the form correctly and submit it.
    * Check the `formMessage` div for success or error messages.
    * Open your "RIA Hunter Waitlist" Google Sheet and verify if the new row of data has appeared (it should appear within seconds).
    * Check your browser's developer console (`F12`) for any `Workspace` errors.
    * Check your Google Apps Script project under `Executions` for any errors if data isn't appearing.

---

### Alternative: Vercel Serverless Functions + Google Sheets API

While Google Apps Script is recommended for simplicity here, an alternative approach involves:

1.  **Creating a Google Cloud Project:** Enable the Google Sheets API.
2.  **Creating a Service Account:** Generate JSON credentials.
3.  **Storing Credentials Securely:** Add the JSON key as an Environment Variable in Vercel. **Never commit keys to GitHub.**
4.  **Creating a Vercel Serverless Function:** (e.g., `api/submitWaitlist.js` in your repo).
    * Use Node.js with the `googleapis` library.
    * Write code to read the request body, validate data, authenticate using the service account, and use the Google Sheets API (`sheets.spreadsheets.values.append`) to add the row.
5.  **Updating Frontend:** Point the `Workspace` call to your Vercel API endpoint (e.g., `/api/submitWaitlist`).
6.  **Sharing Google Sheet:** Share the Google Sheet with the Service Account's email address, giving it "Editor" permissions.

This approach keeps all your *code* within your GitHub/Vercel ecosystem but adds the complexity of managing Google Cloud/API credentials.

---

This plan provides a comprehensive guide for implementing the desired functionality using the Google Apps Script method. It includes code examples and deployment steps, ensuring the AI you pass this to has a clear roadmap. 