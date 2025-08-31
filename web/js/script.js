document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selectors ---
    // Helper functions for DOM selection
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    // Global UI elements
    const todayDateSpan = $('#todayDate');
    const searchInput = $('#search');
    const toggleThemeBtn = $('#toggleTheme');
    const themeIconSun = $('#theme-icon-sun');
    const themeIconMoon = $('#theme-icon-moon');
    const createCampaignBtn = $('#createCampaignBtn');

    // Sidebar statistic elements
    const sidebarSentCount = $('#sidebarSentCount');
    const sidebarRemainingCount = $('#sidebarRemainingCount');

    // Overview Section statistic cards (main content area)
    const overviewSentCount = $('#overviewSentCount');
    const overviewRemainingCount = $('#overviewRemainingCount');

    // Daily Limit Section elements (for #section-limit)
    const limitTextSpan = $('#limitText');
    const limitProgressBar = $('#limitBar');

    // Email Logs Section elements (#section-logs)
    const logsTableBody = $('#logsTable tbody');
    const logDatePicker = $('#logDate');

    // Send Email Form elements (main #section-send)
    const sendMailForm = $('#sendMailForm');
    const mainMailMessage = $('#mailMessage');

    // Send Email Modal elements
    const sendEmailModal = $('#sendEmailModal');
    const modalCloseBtn = $('#modalCloseBtn');
    const modalSendMailForm = $('#modalSendMailForm');
    const modalMailMessage = $('#modalMailMessage');

    // Chart instances (initialized to null)
    let dailySendsChart = null;
    let statusDistributionChart = null;

    // --- Utility Functions ---

    /**
     * Displays a temporary message in the UI.
     * @param {string} message - The message text.
     * @param {string} type - 'success' or 'error' for styling.
     * @param {HTMLElement} targetElement - The DOM element to display the message in.
     */
    function displayMessage(message, type, targetElement) {
        if (!targetElement) {
            console.warn(`Attempted to display message, but target element not found for type: ${type}`);
            return;
        }
        targetElement.textContent = message;
        targetElement.className = `message-area ${type}`;
        targetElement.style.display = 'block';
        setTimeout(() => {
            targetElement.style.display = 'none';
        }, 4000); // Message disappears after 4 seconds
    }

    /**
     * Formats a date string for display in tables.
     * @param {string} dateString - The date string (e.g., from API).
     * @returns {string} Formatted date (e.g., "DD/MM/YYYY HH:MM:SS").
     */
    function formatDateForDisplay(dateString) {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        return new Date(dateString).toLocaleString('en-GB', options);
    }

    /**
     * Gets today's date formatted as "YYYY-MM-DD" in IST.
     * @returns {string} Today's date in IST.
     */
    function getTodayISTDate() {
        const now = new Date();
        const istOffset = 5.5 * 60; // IST is UTC+5:30 in minutes
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000); // Convert to UTC
        const istDate = new Date(utc + (istOffset * 60000)); // Convert to IST
        return istDate.toISOString().split('T')[0]; // Return in YYYY-MM-DD format
    }

    /**
     * Parses a comma-separated email string into an array of trimmed email addresses.
     * @param {string} emailString - The string of emails (e.g., "a@b.com, c@d.com").
     * @returns {string[]} An array of email addresses.
     */
    function parseEmailList(emailString) {
        if (!emailString || emailString.trim() === "") {
            return [];
        }
        return emailString.split(',')
                          .map(email => email.trim())
                          .filter(email => email !== "");
    }

    /**
     * Dynamically retrieves CSS variable values for chart styling.
     * @returns {object} An object containing chart-relevant color variables.
     */
    function getChartColors() {
        const style = getComputedStyle(document.body);
        return {
            gridColor: style.getPropertyValue('--border'),
            textColor: style.getPropertyValue('--muted'),
            primaryColor: style.getPropertyValue('--primary'),
            okColor: style.getPropertyValue('--ok'),
            badColor: style.getPropertyValue('--bad'),
            warnColor: style.getPropertyValue('--warn'),
            primaryWeak: style.getPropertyValue('--primary-weak')
        };
    }

    // --- API Calls & Data Rendering ---

    /** Fetches and updates daily email limit statistics across the dashboard. */
    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;

                // Update sidebar stats
                if (sidebarSentCount) sidebarSentCount.textContent = current_count.toLocaleString();
                if (sidebarRemainingCount) sidebarRemainingCount.textContent = remaining.toLocaleString();

                // Update overview section stat cards
                if (overviewSentCount) overviewSentCount.textContent = current_count.toLocaleString();
                if (overviewRemainingCount) overviewRemainingCount.textContent = remaining.toLocaleString();

                // Update daily limit section (#section-limit)
                if (limitTextSpan) limitTextSpan.textContent = `${current_count.toLocaleString()} / ${limit.toLocaleString()}`;
                if (limitProgressBar) {
                    const percentage = (current_count / limit) * 100;
                    limitProgressBar.style.width = `${Math.min(percentage, 100)}%`;
                    
                    // Change progress bar color based on usage
                    if (percentage >= 100) {
                        limitProgressBar.style.background = 'var(--bad)';
                    } else if (percentage >= 90) {
                        limitProgressBar.style.background = 'var(--warn)';
                    } else {
                        limitProgressBar.style.background = 'linear-gradient(90deg, var(--color-primary-dark), var(--color-primary-light))';
                    }
                }
            } else {
                console.error('Failed to fetch daily limit:', data.message);
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
        }
    }

    /**
     * Fetches and updates the email logs table.
     * @param {string} date - The date to filter logs (YYYY-MM-DD).
     */
    async function updateEmailLogs(date) {
        try {
            let url = `/api/logs?date=${date}`;
            // If viewing today's logs, default to a smaller limit for recent activity.
            // For historical dates, a larger limit is more appropriate.
            if (date === getTodayISTDate()) {
                url += `&limit=5`;
            } else {
                url += `&limit=50`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'success') {
                if (logsTableBody) {
                    logsTableBody.innerHTML = ''; // Clear existing table rows
                    if (data.data.length === 0) {
                        const row = logsTableBody.insertRow();
                        const cell = row.insertCell();
                        cell.colSpan = 4; // Span across 4 columns of the logs table
                        cell.textContent = "No logs found for this date.";
                        cell.style.textAlign = "center";
                        cell.style.padding = "20px";
                        return;
                    }

                    data.data.forEach(log => {
                        const row = logsTableBody.insertRow();
                        const statusBadgeClass = log.status === 'Success' ? 'b-ok' : 'b-bad'; // CSS classes for badges
                        const statusBadgeText = log.status;

                        row.innerHTML = `
                            <td>${log.sent_to}</td>
                            <td>${log.subject}</td>
                            <td><span class="badge ${statusBadgeClass}">${statusBadgeText}</span></td>
                            <td>${formatDateForDisplay(log.sent_at)}</td>
                        `;
                    });
                }
            } else {
                console.error('Failed to fetch email logs:', data.message);
            }
        } catch (error) {
            console.error('Error fetching email logs:', error);
        }
    }

    /** Fetches data for and updates the Email Status Distribution Chart. */
    async function updateStatusDistributionChartData() {
        const colors = getChartColors();
        try {
            const response = await fetch('/api/stats/status-distribution');
            const data = await response.json();

            if (data.status === 'success') {
                const successCount = data.data.Success || 0;
                const failedCount = data.data.Failed || 0;
                // Assuming 0 pending if API doesn't provide it
                const chartData = [successCount, failedCount, 0];

                // Destroy existing chart instance before creating a new one
                if (statusDistributionChart) {
                    statusDistributionChart.destroy();
                }

                const ctx = $('#statusDistributionChart'); // Get the canvas element
                if (ctx) {
                    statusDistributionChart = new Chart(ctx.getContext('2d'), {
                        type: 'doughnut',
                        data: {
                            labels: ['Sent', 'Failed', 'Pending'],
                            datasets: [{
                                data: chartData,
                                backgroundColor: [colors.okColor, colors.badColor, colors.warnColor],
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    position: 'bottom',
                                    labels: {
                                        color: colors.textColor,
                                        boxWidth: 12,
                                        padding: 20,
                                        font: { family: 'Inter', size: 12, weight: '500' }
                                    }
                                }
                            },
                            cutout: '65%', // Defines the inner hole size of the doughnut chart
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching status distribution:', error);
        }
    }

    /** Fetches data for and updates the Daily Sends (Last 7 Days) Chart. */
    async function updateDailySendsChartData() {
        const colors = getChartColors();
        try {
            const response = await fetch('/api/stats/daily-sends?days=7'); // Fetch data for the last 7 days
            const data = await response.json();

            if (data.status === 'success') {
                const dates = Object.keys(data.data).sort(); // Get and sort dates from the API response
                const counts = dates.map(date => data.data[date]);

                // Format dates to short weekday names for chart labels (e.g., Mon, Tue)
                const formattedLabels = dates.map(dateStr => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }));

                // Destroy existing chart instance before creating a new one
                if (dailySendsChart) {
                    dailySendsChart.destroy();
                }

                const ctx = $('#dailySendsChart'); // Get the canvas element
                if (ctx) {
                    dailySendsChart = new Chart(ctx.getContext('2d'), {
                        type: 'line', // Line chart type as per design
                        data: {
                            labels: formattedLabels,
                            datasets: [{
                                label: 'Emails Sent',
                                data: counts,
                                tension: 0.4, // Smooth curve for the line
                                fill: true,
                                backgroundColor: colors.primaryWeak, // Fill color under the line
                                borderColor: colors.primaryColor, // Line color
                                borderWidth: 2,
                                pointRadius: 0 // No visible points on the line
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false } // No legend for this chart
                            },
                            scales: {
                                x: {
                                    grid: { display: false }, // No vertical grid lines
                                    ticks: { color: colors.textColor, font: { family: 'Inter', size: 11 } }
                                },
                                y: {
                                    beginAtZero: true,
                                    grid: { color: colors.gridColor }, // Horizontal grid lines
                                    ticks: {
                                        color: colors.textColor,
                                        precision: 0, // Ensure integer ticks for email counts
                                        font: { family: 'Inter', size: 11 }
                                    }
                                }
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching daily sends data:', error);
        }
    }

    // --- Event Listeners ---

    // Sidebar navigation logic (handling clicks on .nav-link elements)
    if ($$('.sidebar-nav .nav-link')) {
        $$('.sidebar-nav .nav-link').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                // Remove 'active' class from all navigation links
                $$('.sidebar-nav .nav-link').forEach(navLink => navLink.classList.remove('active'));
                // Add 'active' class to the clicked link
                a.classList.add('active');

                const targetSectionId = a.dataset.section; // Get target section ID from data-section attribute
                // Hide all main content sections
                $$('.main-content-sections > section').forEach(section => {
                    section.style.display = 'none';
                    section.classList.remove('active'); // Remove active class to reset animation state
                });
                // Display the target section as a grid
                const targetElement = $(`#section-${targetSectionId}`);
                if (targetElement) {
                    targetElement.style.display = 'grid'; // Set display to 'grid' as per the new layout
                    targetElement.classList.add('active'); // Add active class for fadeIn effect
                }

                // If navigating to the logs section, ensure logs are updated for the currently selected date
                if (targetSectionId === 'logs' && logDatePicker) {
                    updateEmailLogs(logDatePicker.value);
                }
            });
        });
    }

    // "Create Campaign" button in the topbar (opens the email modal)
    if (createCampaignBtn) {
        createCampaignBtn.addEventListener('click', () => {
            if (sendEmailModal) sendEmailModal.style.display = 'flex'; // Show the modal (using flex for centering)
        });
    }

    // "Close" button inside the email modal
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            if (sendEmailModal) sendEmailModal.style.display = 'none'; // Hide the modal
            if (modalSendMailForm) modalSendMailForm.reset(); // Reset modal form fields
            if (modalMailMessage) modalMailMessage.style.display = 'none'; // Hide modal message area
        });
    }

    // Theme toggle button (sun/moon icon in topbar)
    if (toggleThemeBtn) {
        toggleThemeBtn.addEventListener('click', () => {
            const root = document.body;
            const currentTheme = root.dataset.theme;
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            root.dataset.theme = newTheme; // Update the data-theme attribute on the body

            // Toggle visibility of sun/moon icons
            if (themeIconSun) themeIconSun.style.display = newTheme === 'light' ? 'block' : 'none';
            if (themeIconMoon) themeIconMoon.style.display = newTheme === 'dark' ? 'block' : 'none';
            
            updateAllCharts(); // Crucial: Re-render charts to apply new theme colors from CSS variables
        });
    }

    // Main email send form submission (#sendMailForm)
    if (sendMailForm) {
        sendMailForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default form submission

            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true; // Disable button during submission

            // Construct payload with parsed 'to', 'cc', 'bcc' arrays
            const payload = {
                to: parseEmailList($('#to').value),
                cc: parseEmailList($('#cc').value),
                bcc: parseEmailList($('#bcc').value),
                subject: $('#subject').value,
                body: $('#body').value
            };

            try {
                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, // Specify JSON content type
                    body: JSON.stringify(payload), // Send JSON payload
                });
                const data = await response.json();

                if (data.status === 'success') {
                    displayMessage(data.message, 'success', mainMailMessage);
                    e.target.reset(); // Reset form fields
                    updateAllDashboardData(); // Refresh dashboard data after successful send
                } else {
                    displayMessage(data.message, 'error', mainMailMessage);
                }
            } catch (error) {
                console.error('Error sending email:', error);
                displayMessage('An unexpected error occurred. Please try again.', 'error', mainMailMessage);
            } finally {
                if (submitButton) submitButton.disabled = false; // Re-enable button
            }
        });
    }

    // Modal email send form submission (#modalSendMailForm)
    if (modalSendMailForm) {
        modalSendMailForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
            
            // Construct payload with parsed 'to', 'cc', 'bcc' arrays from modal form
            const payload = {
                to: parseEmailList($('#modalTo').value),
                cc: parseEmailList($('#modalCc').value),
                bcc: parseEmailList($('#modalBcc').value),
                subject: $('#modalSubject').value,
                body: $('#modalBody').value
            };

            try {
                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, // Specify JSON content type
                    body: JSON.stringify(payload), // Send JSON payload
                });
                const data = await response.json();

                if (data.status === 'success') {
                    displayMessage(data.message, 'success', modalMailMessage);
                    e.target.reset(); // Reset modal form fields
                    updateAllDashboardData(); // Refresh dashboard data
                    setTimeout(() => { // Hide modal after a short delay to show success message
                        if (sendEmailModal) sendEmailModal.style.display = 'none';
                        if (modalMailMessage) modalMailMessage.style.display = 'none';
                    }, 2000);
                } else {
                    displayMessage(data.message, 'error', modalMailMessage);
                }
            } catch (error) {
                console.error('Error sending email:', error);
                displayMessage('An unexpected error occurred. Please try again.', 'error', modalMailMessage);
            } finally {
                if (submitButton) submitButton.disabled = false; // Re-enable button
            }
        });
    }

    // Log date picker change event
    if (logDatePicker) {
        logDatePicker.addEventListener('change', () => {
            const selectedDate = logDatePicker.value;
            updateEmailLogs(selectedDate); // Update logs for the newly selected date
        });
    }

    // Search input field for logs (filters currently displayed logs)
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (logsTableBody) {
                const rows = [...logsTableBody.rows]; // Get all current table rows
                rows.forEach(r => {
                    const rowText = r.textContent.toLowerCase();
                    r.style.display = rowText.includes(query) ? '' : 'none'; // Show/hide rows based on search query
                });
            }
        });
    }

    // --- Initial Load & Refresh Logic ---

    /** Destroys and recreates all chart instances to apply new theme colors. */
    function updateAllCharts() {
        // Destroy existing chart instances if they exist
        if (dailySendsChart) {
            dailySendsChart.destroy();
            dailySendsChart = null; // Clear reference
        }
        if (statusDistributionChart) {
            statusDistributionChart.destroy();
            statusDistributionChart = null; // Clear reference
        }
        // Then call update functions which will re-create them with current theme colors
        updateDailySendsChartData();
        updateStatusDistributionChartData();
    }

    /** Refreshes all dashboard data (limits, charts, logs). */
    function updateAllDashboardData() {
        updateDailyLimit(); // Update limit stats
        updateAllCharts();  // Update all charts
        
        // Update logs for the currently selected date or today's date
        if (logDatePicker) {
            updateEmailLogs(logDatePicker.value);
        } else {
            updateEmailLogs(getTodayISTDate());
        }
    }

    // Initialize the date picker and today's date display in the topbar
    const todayIST = getTodayISTDate();
    if (logDatePicker) logDatePicker.value = todayIST;
    if (todayDateSpan) todayDateSpan.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Set initial theme based on system preference (if supported) or default to light
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
        document.body.dataset.theme = 'dark';
        if (themeIconSun) themeIconSun.style.display = 'none';
        if (themeIconMoon) themeIconMoon.style.display = 'block';
    } else {
        document.body.dataset.theme = 'light';
        if (themeIconSun) themeIconSun.style.display = 'block';
        if (themeIconMoon) themeIconMoon.style.display = 'none';
    }

    // Perform initial data load for the entire dashboard
    updateAllDashboardData();

    // Set up a periodic refresh for dashboard data (every 30 seconds)
    setInterval(updateAllDashboardData, 30000);
});