document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selectors ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    // Global elements
    const todayDateSpan = $('#todayDate');
    const searchInput = $('#search');
    const toggleThemeBtn = $('#toggleTheme');
    const themeIconSun = $('#theme-icon-sun');
    const themeIconMoon = $('#theme-icon-moon');
    const createCampaignBtn = $('#createCampaignBtn');

    // Sidebar stat elements
    const sidebarSentCount = $('#sidebarSentCount');
    const sidebarRemainingCount = $('#sidebarRemainingCount');

    // Overview Section stat cards (main content)
    const overviewSentCount = $('#overviewSentCount');
    const overviewRemainingCount = $('#overviewRemainingCount');

    // Daily Limit Section elements
    const limitTextSpan = $('#limitText');
    const limitProgressBar = $('#limitBar');

    // Logs Section elements
    const logsTableBody = $('#logsTable tbody');
    const logDatePicker = $('#logDate');

    // Send Email Form elements (main section - if it exists)
    const sendMailForm = $('#sendMailForm');
    const mainMailMessage = $('#mailMessage');

    // Send Email Modal elements
    const sendEmailModal = $('#sendEmailModal');
    const modalCloseBtn = $('#modalCloseBtn');
    const modalSendMailForm = $('#modalSendMailForm');
    const modalMailMessage = $('#modalMailMessage');


    // Chart instances
    let dailySendsChart = null;
    let statusDistributionChart = null;

    // --- Utility Functions ---
    function displayMessage(message, type, targetElement) {
        if (!targetElement) {
            console.warn(`Attempted to display message, but target element not found for type: ${type}`);
            return;
        }
        targetElement.textContent = message;
        targetElement.className = `message-area ${type}`; // Using new message area classes
        targetElement.style.display = 'block';
        setTimeout(() => {
            targetElement.style.display = 'none';
        }, 4000); // Hide after 4 seconds
    }

    function formatDateForDisplay(dateString) {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        return new Date(dateString).toLocaleString('en-GB', options);
    }

    function getTodayISTDate() {
        const now = new Date();
        const istOffset = 5.5 * 60; // IST is UTC+5:30 in minutes
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000); // Convert to UTC
        const istDate = new Date(utc + (istOffset * 60000)); // Convert to IST
        return istDate.toISOString().split('T')[0]; // YYYY-MM-DD format (e.g., "2025-08-14")
    }

    // --- Chart Styling Helpers (Adapted from new CSS variables) ---
    function getChartColors() {
        const style = getComputedStyle(document.body);
        return {
            gridColor: style.getPropertyValue('--color-border'),
            textColor: style.getPropertyValue('--color-text-light'), // Muted text for labels/ticks
            primaryColor: style.getPropertyValue('--color-primary-dark'), // Primary for line/bar color
            okColor: style.getPropertyValue('--ok'), // Green for success
            badColor: style.getPropertyValue('--bad'), // Red for failed
            warnColor: style.getPropertyValue('--warn'), // Orange for warning/pending
            primaryWeak: style.getPropertyValue('--color-primary-light') // Or a specific rgba value for fill
        };
    }

    // --- API Calls & Data Rendering ---

    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;

                // Safely update sidebar stats
                if (sidebarSentCount) sidebarSentCount.textContent = current_count.toLocaleString();
                if (sidebarRemainingCount) sidebarRemainingCount.textContent = remaining.toLocaleString();

                // Safely update overview stats (main content)
                if (overviewSentCount) overviewSentCount.textContent = current_count.toLocaleString();
                if (overviewRemainingCount) overviewRemainingCount.textContent = remaining.toLocaleString();

                // Safely update daily limit section
                if (limitTextSpan) limitTextSpan.textContent = `${current_count.toLocaleString()} / ${limit.toLocaleString()}`;
                if (limitProgressBar) {
                    const percentage = (current_count / limit) * 100;
                    limitProgressBar.style.width = `${Math.min(percentage, 100)}%`;

                    // Update progress bar color
                    if (percentage >= 100) {
                        limitProgressBar.style.background = 'var(--bad)'; // Use direct color for bad
                    } else if (percentage >= 90) {
                        limitProgressBar.style.background = 'var(--warn)'; // Use direct color for warning
                    } else {
                        // Use a gradient from the new color palette
                        limitProgressBar.style.background = `linear-gradient(90deg, var(--color-primary-dark), var(--color-primary-light))`;
                    }
                }

            } else {
                console.error('Failed to fetch daily limit:', data.message);
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
        }
    }

    async function updateEmailLogs(date) {
        try {
            let url = `/api/logs?date=${date}`;
            // For logs section, the design implies showing all for selected date, or top 5 for today
            if (date === getTodayISTDate()) {
                url += `&limit=5`; // Show only the newest 5 for the current day initially
            } else {
                url += `&limit=50`; // For historical dates, show up to 50
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'success') {
                if (logsTableBody) {
                    logsTableBody.innerHTML = '';
                    if (data.data.length === 0) {
                        const row = logsTableBody.insertRow();
                        const cell = row.insertCell();
                        cell.colSpan = 4; // Table has 4 columns: Recipient, Subject, Result, Date
                        cell.textContent = "No logs found for this date.";
                        cell.style.textAlign = "center";
                        cell.style.padding = "20px";
                        return;
                    }

                    data.data.forEach(log => {
                        const row = logsTableBody.insertRow();
                        // Status badge classes are b-ok, b-bad, b-warn as per new CSS
                        const statusBadgeClass = log.status === 'Success' ? 'b-ok' : 'b-bad';
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

    async function updateStatusDistributionChartData() {
        const colors = getChartColors();
        try {
            const response = await fetch('/api/stats/status-distribution');
            const data = await response.json();

            if (data.status === 'success') {
                const successCount = data.data.Success || 0;
                const failedCount = data.data.Failed || 0;
                // The new design's doughnut chart has 'Sent', 'Failed', 'Pending'.
                // If your backend only returns 'Success'/'Failed', we assume 'Sent' is 'Success'.
                // And 'Pending' needs to be assumed as 0 or added to API. For now, we'll represent only 'Sent' and 'Failed'.
                // To match the new design with 'Sent', 'Failed', 'Pending' labels:
                const chartData = [successCount, failedCount, 0]; // Assume 0 pending for now unless your API sends it

                if (statusDistributionChart) {
                    statusDistributionChart.destroy(); // Destroy existing chart before re-creating
                }

                const ctx = $('#statusDistributionChart');
                if (ctx) {
                    statusDistributionChart = new Chart(ctx.getContext('2d'), {
                        type: 'doughnut',
                        data: {
                            labels: ['Sent', 'Failed', 'Pending'], // Labels from the mock design
                            datasets: [{
                                data: chartData,
                                backgroundColor: [colors.okColor, colors.badColor, colors.warnColor], // Green, Red, Orange
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
                                        color: colors.textColor, // Dynamic text color for legend labels
                                        boxWidth: 12,
                                        padding: 20,
                                        font: { family: 'Inter', size: 12, weight: '500' }
                                    }
                                }
                            },
                            cutout: '65%', // Inner hole size
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching status distribution:', error);
        }
    }

    async function updateDailySendsChartData() {
        const colors = getChartColors();
        try {
            const response = await fetch('/api/stats/daily-sends?days=7');
            const data = await response.json();

            if (data.status === 'success') {
                const dates = Object.keys(data.data).sort();
                const counts = dates.map(date => data.data[date]);

                const formattedLabels = dates.map(dateStr => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }));

                if (dailySendsChart) {
                    dailySendsChart.destroy(); // Destroy existing chart before re-creating
                }

                const ctx = $('#dailySendsChart');
                if (ctx) {
                    dailySendsChart = new Chart(ctx.getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: formattedLabels,
                            datasets: [{
                                label: 'Emails Sent',
                                data: counts,
                                tension: 0.4, // Smooth curve
                                fill: true,
                                backgroundColor: 'rgba(30,58,56,.12)', // A specific rgba from the mock's primary-dark color for fill
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
                                        precision: 0, // Integer ticks for counts
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

    // Sidebar navigation (using .sidebar-nav a for the links)
    $$('.sidebar-nav .nav-link').forEach(a => { // Corrected selector to match new HTML
        a.addEventListener('click', e => {
            e.preventDefault();
            // Remove 'active' from all nav links
            $$('.sidebar-nav .nav-link').forEach(navLink => navLink.classList.remove('active')); // Corrected selector
            // Add 'active' to the clicked link
            a.classList.add('active');

            const targetSectionId = a.dataset.section; // Get section ID from data-section attribute
            // Hide all main content sections
            $$('.main-content-sections > section').forEach(section => { // Select direct children section of main-content-sections
                section.style.display = 'none';
                section.classList.remove('active'); // Remove active class for fadeIn effect
            });
            // Display the target section
            const targetElement = $(`#section-${targetSectionId}`);
            if (targetElement) { // Ensure element exists before trying to set display
                // The new design uses 'display: grid' for sections that are active, and 'content-section' class
                targetElement.style.display = 'grid'; // Display as grid
                targetElement.classList.add('active'); // Add active class for fadeIn effect
            }

            // If navigating to logs, ensure it updates
            if (targetSectionId === 'logs') {
                updateEmailLogs(logDatePicker.value);
            }
        });
    });

    // Create Campaign Button (Topbar) -> Opens modal for sending email
    if (createCampaignBtn) {
        createCampaignBtn.addEventListener('click', () => {
            if (sendEmailModal) sendEmailModal.style.display = 'flex';
        });
    }

    // Close Modal Button
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            if (sendEmailModal) sendEmailModal.style.display = 'none';
            if (modalSendMailForm) modalSendMailForm.reset();
            if (modalMailMessage) modalMailMessage.style.display = 'none';
        });
    }

    // Theme Toggle
    if (toggleThemeBtn) {
        toggleThemeBtn.addEventListener('click', () => {
            const root = document.body;
            const currentTheme = root.dataset.theme;
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            root.dataset.theme = newTheme;

            // Update icon display
            if (themeIconSun) themeIconSun.style.display = newTheme === 'light' ? 'block' : 'none';
            if (themeIconMoon) themeIconMoon.style.display = newTheme === 'dark' ? 'block' : 'none';

            updateAllCharts(); // Crucial: Re-render charts to apply new theme colors
        });
    }

    // Send Mail Form Submission (main section form - check if it exists)
    if (sendMailForm) {
        sendMailForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const to = $('#to').value;
            const subject = $('#subject').value;
            const body = $('#body').value;

            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to, subject, body }),
                });
                const data = await response.json();

                if (data.status === 'success') {
                    displayMessage(data.message, 'success', mainMailMessage);
                    e.target.reset(); // Clear form
                    updateAllDashboardData(); // Refresh all dashboard data
                } else {
                    displayMessage(data.message, 'error', mainMailMessage);
                }
            } catch (error) {
                console.error('Error sending email:', error);
                displayMessage('An unexpected error occurred. Please try again.', 'error', mainMailMessage);
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

    // Send Mail Form Submission (modal form - check if it exists)
    if (modalSendMailForm) {
        modalSendMailForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const to = $('#modalTo').value;
            const subject = $('#modalSubject').value;
            const body = $('#modalBody').value;

            const submitButton = e.target.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to, subject, body }),
                });
                const data = await response.json();

                if (data.status === 'success') {
                    displayMessage(data.message, 'success', modalMailMessage);
                    e.target.reset(); // Clear form
                    updateAllDashboardData(); // Refresh all dashboard data
                    setTimeout(() => { // Hide modal after successful send and message display
                        if (sendEmailModal) sendEmailModal.style.display = 'none';
                        if (modalMailMessage) modalMailMessage.style.display = 'none';
                    }, 2000); // 2 second delay before hiding modal
                } else {
                    displayMessage(data.message, 'error', modalMailMessage);
                }
            } catch (error) {
                console.error('Error sending email:', error);
                displayMessage('An unexpected error occurred. Please try again.', 'error', modalMailMessage);
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

    // Log Date Picker Change
    if (logDatePicker) {
        logDatePicker.addEventListener('change', () => {
            const selectedDate = logDatePicker.value;
            updateEmailLogs(selectedDate);
        });
    }

    // Search functionality for logs
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (logsTableBody) {
                const rows = [...logsTableBody.rows];
                rows.forEach(r => {
                    const rowText = r.textContent.toLowerCase();
                    r.style.display = rowText.includes(query) ? '' : 'none';
                });
            }
        });
    }

    // ====== Initial Load & Refresh Logic ======

    function updateAllCharts() {
        // Destroy existing charts to ensure new theme colors are applied
        if (dailySendsChart) {
            dailySendsChart.destroy();
            dailySendsChart = null;
        }
        if (statusDistributionChart) {
            statusDistributionChart.destroy();
            statusDistributionChart = null;
        }
        updateDailySendsChartData();
        updateStatusDistributionChartData();
    }

    function updateAllDashboardData() {
        updateDailyLimit();
        updateAllCharts();

        if (logDatePicker) {
            updateEmailLogs(logDatePicker.value);
        } else {
            updateEmailLogs(getTodayISTDate());
        }
    }

    // Set initial theme based on system preference or default to light
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

    // Set today's date in the date picker and topbar date display
    const todayIST = getTodayISTDate();
    if (logDatePicker) logDatePicker.value = todayIST;
    if (todayDateSpan) todayDateSpan.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Initial load of all dashboard data
    updateAllDashboardData();

    // Optionally, refresh dashboard data periodically
    setInterval(updateAllDashboardData, 30000); // Every 30 seconds
});