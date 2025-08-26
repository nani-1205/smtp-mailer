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

    // Send Email Form elements
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
        if (!targetElement) return; // Safely exit if element not found
        targetElement.textContent = message;
        targetElement.className = `message-area ${type}`;
        targetElement.style.display = 'block';
        setTimeout(() => {
            targetElement.style.display = 'none';
        }, 4000);
    }

    function formatDateForDisplay(dateString) {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleString('en-GB', options);
    }

    function getTodayISTDate() {
        const now = new Date();
        const istOffset = 5.5 * 60;
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (istOffset * 60000));
        return istDate.toISOString().split('T')[0];
    }

    // --- Chart Styling Helpers ---
    function getChartColors() {
        const style = getComputedStyle(document.body);
        return {
            gridColor: style.getPropertyValue('--color-border'),
            textColor: style.getPropertyValue('--color-text-light'),
            primaryColor: style.getPropertyValue('--color-primary-dark'),
            okColor: style.getPropertyValue('--ok'),
            badColor: style.getPropertyValue('--bad'),
            warnColor: style.getPropertyValue('--warn'),
            primaryWeak: 'rgba(30, 58, 56, 0.12)'
        };
    }

    // --- API Calls & Data Rendering ---

    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;

                // Safely update all stat displays
                if (sidebarSentCount) sidebarSentCount.textContent = current_count.toLocaleString();
                if (sidebarRemainingCount) sidebarRemainingCount.textContent = remaining.toLocaleString();
                if (overviewSentCount) overviewSentCount.textContent = current_count.toLocaleString();
                if (overviewRemainingCount) overviewRemainingCount.textContent = remaining.toLocaleString();
                if (limitTextSpan) limitTextSpan.textContent = `${current_count.toLocaleString()} / ${limit.toLocaleString()}`;
                if (limitProgressBar) {
                    const percentage = (limit > 0) ? (current_count / limit) * 100 : 0;
                    limitProgressBar.style.width = `${Math.min(percentage, 100)}%`;
                }
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
        }
    }

    async function updateEmailLogs(date) {
        try {
            let url = `/api/logs?date=${date}&limit=50`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'success' && logsTableBody) {
                logsTableBody.innerHTML = '';
                if (data.data.length === 0) {
                    const row = logsTableBody.insertRow();
                    const cell = row.insertCell();
                    cell.colSpan = 4;
                    cell.textContent = "No logs found for this date.";
                    cell.style.textAlign = "center";
                    cell.style.padding = "20px";
                    return;
                }
                data.data.forEach(log => {
                    const row = logsTableBody.insertRow();
                    const statusBadgeClass = log.status === 'Success' ? 'b-ok' : 'b-bad';
                    row.innerHTML = `
                        <td>${log.sent_to}</td>
                        <td>${log.subject}</td>
                        <td><span class="badge ${statusBadgeClass}">${log.status}</span></td>
                        <td>${formatDateForDisplay(log.sent_at)}</td>
                    `;
                });
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
                const chartData = [successCount, failedCount, 0]; // Assume 0 pending

                if (statusDistributionChart) statusDistributionChart.destroy();
                
                const ctx = $('#statusDistributionChart');
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
                                    labels: { color: colors.textColor, boxWidth: 12, padding: 20, font: { family: 'Inter', size: 12, weight: '500' } }
                                }
                            },
                            cutout: '65%',
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

                if (dailySendsChart) dailySendsChart.destroy();

                const ctx = $('#dailySendsChart');
                if (ctx) {
                    dailySendsChart = new Chart(ctx.getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: formattedLabels,
                            datasets: [{
                                label: 'Emails Sent',
                                data: counts,
                                tension: 0.4,
                                fill: true,
                                backgroundColor: colors.primaryWeak,
                                borderColor: colors.primaryColor,
                                borderWidth: 2,
                                pointRadius: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { grid: { display: false }, ticks: { color: colors.textColor, font: { family: 'Inter', size: 11 } } },
                                y: { beginAtZero: true, grid: { color: colors.gridColor }, ticks: { color: colors.textColor, precision: 0, font: { family: 'Inter', size: 11 } } }
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
    if ($$('.nav-link')) {
        $$('.nav-link').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                $$('.nav-link').forEach(navLink => navLink.classList.remove('active'));
                a.classList.add('active');

                const targetSectionId = a.dataset.section;
                $$('.content-section').forEach(section => {
                    section.style.display = 'none';
                    section.classList.remove('active');
                });
                const targetElement = $(`#section-${targetSectionId}`);
                if (targetElement) {
                    targetElement.style.display = 'grid'; // Use grid for layout consistency
                    targetElement.classList.add('active');
                }
                if (targetSectionId === 'logs') {
                    updateEmailLogs(logDatePicker.value);
                }
            });
        });
    }

    if (createCampaignBtn) createCampaignBtn.addEventListener('click', () => { if (sendEmailModal) sendEmailModal.style.display = 'flex'; });
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => { if (sendEmailModal) sendEmailModal.style.display = 'none'; });

    if (toggleThemeBtn) {
        toggleThemeBtn.addEventListener('click', () => {
            const root = document.body;
            const currentTheme = root.dataset.theme;
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            root.dataset.theme = newTheme;
            if (themeIconSun) themeIconSun.style.display = newTheme === 'light' ? 'block' : 'none';
            if (themeIconMoon) themeIconMoon.style.display = newTheme === 'dark' ? 'block' : 'none';
            updateAllCharts();
        });
    }

    // Generic form submission handler
    const handleFormSubmit = async (e, messageElement) => {
        e.preventDefault();
        const form = e.target;
        const to = form.querySelector('[name="to"]').value;
        const subject = form.querySelector('[name="subject"]').value;
        const body = form.querySelector('[name="body"]').value;
        const submitButton = form.querySelector('button[type="submit"]');

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, subject, body }),
            });
            const data = await response.json();

            if (data.status === 'success') {
                displayMessage(data.message, 'success', messageElement);
                form.reset();
                updateAllDashboardData();
                if (sendEmailModal && sendEmailModal.style.display === 'flex') {
                    setTimeout(() => { sendEmailModal.style.display = 'none'; }, 2000);
                }
            } else {
                displayMessage(data.message, 'error', messageElement);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            displayMessage('An unexpected error occurred.', 'error', messageElement);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    };
    
    if (sendMailForm) sendMailForm.addEventListener('submit', (e) => handleFormSubmit(e, mainMailMessage));
    if (modalSendMailForm) modalSendMailForm.addEventListener('submit', (e) => handleFormSubmit(e, modalMailMessage));

    if (logDatePicker) logDatePicker.addEventListener('change', () => updateEmailLogs(logDatePicker.value));
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (logsTableBody) {
                [...logsTableBody.rows].forEach(r => {
                    r.style.display = r.textContent.toLowerCase().includes(query) ? '' : 'none';
                });
            }
        });
    }

    // ====== Initial Load & Refresh Logic ======
    function updateAllCharts() {
        updateDailySendsChartData();
        updateStatusDistributionChartData();
    }
    function updateAllDashboardData() {
        updateDailyLimit();
        updateAllCharts();
        if (logDatePicker) updateEmailLogs(logDatePicker.value);
    }
    
    // Set initial state
    const todayIST = getTodayISTDate();
    if (logDatePicker) logDatePicker.value = todayIST;
    if (todayDateSpan) todayDateSpan.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    updateAllDashboardData();
    setInterval(updateAllDashboardData, 30000);
});