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

    // Overview Section stat cards
    const overviewSentCount = $('#overviewSentCount');
    const overviewRemainingCount = $('#overviewRemainingCount');

    // Daily Limit Section elements
    const limitTextSpan = $('#limitText');
    const limitProgressBar = $('#limitBar');

    // Logs Section elements
    const logsTableBody = $('#logsTable tbody');
    const logDatePicker = $('#logDate');

    // Send Email Form elements (main section)
    const sendMailForm = $('#sendMailForm');
    const mainMailMessage = $('#mailMessage');

    // Send Email Modal elements
    const sendEmailModal = $('#sendEmailModal');
    const modalCloseBtn = $('#modalCloseBtn');
    const modalSendMailForm = $('#modalSendMailForm');
    const modalMailMessage = $('#modalMailMessage');


    // Chart instances
    let dailySendsChart, statusDistributionChart;

    // --- Utility Functions ---
    function displayMessage(message, type, targetElement) {
        targetElement.textContent = message;
        targetElement.className = `message-area ${type}`;
        targetElement.style.display = 'block';
        setTimeout(() => {
            targetElement.style.display = 'none';
        }, 4000); // Hide after 4 seconds
    }

    function formatDateForDisplay(dateString) {
        // Format for table display (e.g., "DD/MM/YYYY HH:MM:SS")
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
        // Dynamically get CSS variable values for charts
        const style = getComputedStyle(document.body);
        return {
            gridColor: style.getPropertyValue('--border'),
            textColor: style.getPropertyValue('--muted'),
            primaryColor: style.getPropertyValue('--primary'), // Adjusted for dark theme in CSS
            okColor: style.getPropertyValue('--ok'),
            badColor: style.getPropertyValue('--bad'),
            warnColor: style.getPropertyValue('--warn'),
            primaryWeak: style.getPropertyValue('--primary-weak') // For line chart fill
        };
    }

    // --- API Calls & Data Rendering ---

    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;

                // Update Sidebar stats
                sidebarSentCount.textContent = current_count.toLocaleString();
                sidebarRemainingCount.textContent = remaining.toLocaleString();

                // Update Overview Section stat cards
                overviewSentCount.textContent = current_count.toLocaleString();
                overviewRemainingCount.textContent = remaining.toLocaleString();

                // Update Daily Limit Section (via text and progress bar)
                limitTextSpan.textContent = `${current_count.toLocaleString()} / ${limit.toLocaleString()}`;
                const percentage = (current_count / limit) * 100;
                limitProgressBar.style.width = `${Math.min(percentage, 100)}%`;

                // Optionally, update progress bar color based on usage percentage
                if (percentage >= 100) {
                     limitProgressBar.style.background = 'var(--bad)';
                } else if (percentage >= 90) {
                     limitProgressBar.style.background = 'var(--warn)';
                } else {
                     // Revert to default gradient from CSS variable (must be in background property)
                     limitProgressBar.style.background = 'linear-gradient(90deg, var(--primary), #22d3ee)';
                }

            } else {
                console.error('Failed to fetch daily limit:', data.message);
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
        }
    }

    async function updateEmailLogs(date) { // 'date' parameter is now required
        try {
            let url = `/api/logs?date=${date}`;
            // If it's today's date, fetch only newest 5 for overview purposes.
            // For other dates, fetch a larger set (e.g., 50) as history.
            if (date === getTodayISTDate()) {
                url += `&limit=5`; // Default for today's logs view
            } else {
                url += `&limit=50`; // Default for selected date view
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'success') {
                logsTableBody.innerHTML = ''; // Clear existing logs
                if (data.data.length === 0) {
                    const row = logsTableBody.insertRow();
                    const cell = row.insertCell();
                    cell.colSpan = 4; // Table has 4 columns now: Recipient, Subject, Result, Date
                    cell.textContent = "No logs found for this date.";
                    cell.style.textAlign = "center";
                    cell.style.padding = "20px";
                    return;
                }

                data.data.forEach(log => {
                    const row = logsTableBody.insertRow();
                    const statusBadgeClass = log.status === 'Success' ? 'b-ok' : 'b-bad';
                    const statusBadgeText = log.status; // 'Success' or 'Failed'

                    row.innerHTML = `
                        <td>${log.sent_to}</td>
                        <td>${log.subject}</td>
                        <td><span class="badge ${statusBadgeClass}">${statusBadgeText}</span></td>
                        <td>${formatDateForDisplay(log.sent_at)}</td>
                    `;
                });
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
                const chartData = [successCount, failedCount]; // Only Sent and Failed for this chart

                if (statusDistributionChart) {
                    statusDistributionChart.data.datasets[0].data = chartData;
                    // Update background colors in case theme changed
                    statusDistributionChart.data.datasets[0].backgroundColor = [colors.okColor, colors.badColor];
                    statusDistributionChart.update();
                } else {
                    const ctx = $('#statusDistributionChart').getContext('2d');
                    statusDistributionChart = new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ['Sent', 'Failed'], // Changed from Success, Failed, Pending to Sent, Failed
                            datasets: [{
                                data: chartData,
                                backgroundColor: [colors.okColor, colors.badColor],
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
                                        color: colors.textColor, // Use dynamic text color
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
            const response = await fetch('/api/stats/daily-sends?days=7'); // Fetch last 7 days
            const data = await response.json();

            if (data.status === 'success') {
                const dates = Object.keys(data.data).sort(); // Get sorted dates
                const counts = dates.map(date => data.data[date]);

                // Format labels to be short weekday names (e.g., Mon, Tue)
                const formattedLabels = dates.map(dateStr => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }));

                if (dailySendsChart) {
                    dailySendsChart.data.labels = formattedLabels;
                    dailySendsChart.data.datasets[0].data = counts;
                    // Update colors in case theme changed
                    dailySendsChart.data.datasets[0].borderColor = colors.primaryColor;
                    dailySendsChart.data.datasets[0].backgroundColor = colors.primaryWeak;
                    dailySendsChart.options.scales.x.ticks.color = colors.textColor;
                    dailySendsChart.options.scales.y.grid.color = colors.gridColor;
                    dailySendsChart.options.scales.y.ticks.color = colors.textColor;
                    dailySendsChart.update();
                } else {
                    const ctx = $('#dailySendsChart').getContext('2d');
                    dailySendsChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: formattedLabels,
                            datasets: [{
                                label: 'Emails Sent',
                                data: counts,
                                tension: 0.4, // Smooth curve
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

    // Sidebar navigation (using new classes .sidebar-nav a and data-section)
    $$('.sidebar-nav a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            // Remove 'active' from all nav links
            $$('.sidebar-nav a').forEach(navLink => navLink.classList.remove('active'));
            // Add 'active' to the clicked link
            a.classList.add('active');

            const targetSectionId = a.dataset.section; // Get section ID from data-section attribute
            // Hide all main content sections
            $$('main section.grid').forEach(section => {
                section.style.display = 'none';
            });
            // Display the target section
            $(`#section-${targetSectionId}`).style.display = 'grid'; // Ensure it's displayed as grid

            // If navigating to logs, ensure it updates
            if (targetSectionId === 'logs') {
                updateEmailLogs(logDatePicker.value);
            }
        });
    });

    // Create Campaign Button (Topbar) -> Opens modal for sending email
    createCampaignBtn.addEventListener('click', () => {
        sendEmailModal.style.display = 'flex'; // Show the modal
    });

    // Close Modal Button
    modalCloseBtn.addEventListener('click', () => {
        sendEmailModal.style.display = 'none'; // Hide the modal
        modalSendMailForm.reset(); // Clear modal form
        modalMailMessage.style.display = 'none'; // Hide modal message
    });

    // Theme Toggle
    toggleThemeBtn.addEventListener('click', () => {
        const root = document.body;
        const isDark = root.dataset.theme === 'dark';
        root.dataset.theme = isDark ? 'light' : 'dark';
        themeIconSun.style.display = isDark ? 'block' : 'none'; // Show sun if switching to light
        themeIconMoon.style.display = isDark ? 'none' : 'block'; // Show moon if switching to dark
        updateAllCharts(); // Re-render charts to pick up new theme colors
    });

    // Send Mail Form Submission (main form)
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
            if (submitButton) submitButton.disabled = false; // Re-enable button
        }
    });

    // Send Mail Form Submission (modal form)
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
                    sendEmailModal.style.display = 'none';
                    modalMailMessage.style.display = 'none'; // Hide message immediately
                }, 2000); // 2 second delay before hiding modal
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

    // Log Date Picker Change
    logDatePicker.addEventListener('change', () => {
        const selectedDate = logDatePicker.value;
        updateEmailLogs(selectedDate); // Now this simply filters by date
    });

    // Search functionality for logs (filters what's currently displayed)
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = [...logsTableBody.rows]; // Get all current rows
        rows.forEach(r => {
            // Check if text content of any cell matches query
            const rowText = r.textContent.toLowerCase();
            r.style.display = rowText.includes(query) ? '' : 'none';
        });
    });

    // ====== Initial Load & Refresh Logic ======

    function updateAllCharts() {
        updateDailySendsChartData();
        updateStatusDistributionChartData();
    }

    function updateAllDashboardData() {
        updateDailyLimit();
        updateAllCharts();
        updateEmailLogs(getTodayISTDate()); // Load today's logs initially for the logs section
    }

    // Set today's date in the date picker and topbar date display
    const todayIST = getTodayISTDate();
    logDatePicker.value = todayIST;
    todayDateSpan.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Initial load of all dashboard data
    updateAllDashboardData();

    // Optionally, refresh dashboard data periodically
    setInterval(updateAllDashboardData, 30000); // Every 30 seconds
});