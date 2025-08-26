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
    let dailySendsChart = null;
    let statusDistributionChart = null;

    // --- Utility Functions ---
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
        }, 5000);
    }

    function formatDateForDisplay(dateString) {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        return new Date(dateString).toLocaleString('en-GB', options);
    }

    function getTodayISTDate() {
        const now = new Date();
        const istOffset = 5.5 * 60;
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (istOffset * 60000));
        return istDate.toISOString().split('T')[0];
    }
    
    function parseEmailList(emailString) {
        if (!emailString || emailString.trim() === "") {
            return [];
        }
        return emailString.split(',')
                          .map(email => email.trim())
                          .filter(email => email !== "");
    }

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
    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;

                if (sidebarSentCount) sidebarSentCount.textContent = current_count.toLocaleString();
                if (sidebarRemainingCount) sidebarRemainingCount.textContent = remaining.toLocaleString();
                if (overviewSentCount) overviewSentCount.textContent = current_count.toLocaleString();
                if (overviewRemainingCount) overviewRemainingCount.textContent = remaining.toLocaleString();
                if (limitTextSpan) limitTextSpan.textContent = `${current_count.toLocaleString()} / ${limit.toLocaleString()}`;
                if (limitProgressBar) {
                    const percentage = (current_count / limit) * 100;
                    limitProgressBar.style.width = `${Math.min(percentage, 100)}%`;
                    
                    if (percentage >= 100) {
                        limitProgressBar.style.background = 'var(--bad)';
                    } else if (percentage >= 90) {
                        limitProgressBar.style.background = 'var(--warn)';
                    } else {
                        limitProgressBar.style.background = 'linear-gradient(90deg, var(--color-primary-dark), var(--color-primary-light))';
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
        }
    }

    async function updateEmailLogs(date) {
        try {
            let url = `/api/logs?date=${date}`;
            if (date === getTodayISTDate()) {
                url += `&limit=5`;
            } else {
                url += `&limit=50`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'success') {
                if (logsTableBody) {
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
                        const statusBadgeText = log.status;
                        row.innerHTML = `
                            <td>${log.sent_to}</td>
                            <td>${log.subject}</td>
                            <td><span class="badge ${statusBadgeClass}">${statusBadgeText}</span></td>
                            <td>${formatDateForDisplay(log.sent_at)}</td>
                        `;
                    });
                }
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
                const chartData = [successCount, failedCount, 0];

                if (statusDistributionChart) {
                    statusDistributionChart.destroy();
                }

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
                                    labels: {
                                        color: colors.textColor,
                                        boxWidth: 12,
                                        padding: 20,
                                        font: { family: 'Inter', size: 12, weight: '500' }
                                    }
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

                if (dailySendsChart) {
                    dailySendsChart.destroy();
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
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                x: {
                                    grid: { display: false },
                                    ticks: { color: colors.textColor, font: { family: 'Inter', size: 11 } }
                                },
                                y: {
                                    beginAtZero: true,
                                    grid: { color: colors.gridColor },
                                    ticks: {
                                        color: colors.textColor,
                                        precision: 0,
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
    
    // --- NEW: Centralized Form Submission Logic for FormData ---
    async function handleFormSubmit(formElement, messageElement) {
        // Find all input elements within the form
        const toInput = formElement.querySelector('[name="to"]');
        const ccInput = formElement.querySelector('[name="cc"]');
        const bccInput = formElement.querySelector('[name="bcc"]');
        const subjectInput = formElement.querySelector('[name="subject"]');
        const bodyInput = formElement.querySelector('[name="body"]');
        const attachmentsInput = formElement.querySelector('[name="attachments"]');
        const submitButton = formElement.querySelector('button[type="submit"]');

        const formData = new FormData();

        // 1. Create a JSON object with the email text data
        const emailData = {
            to: toInput.value,
            cc: parseEmailList(ccInput ? ccInput.value : ''),
            bcc: parseEmailList(bccInput ? bccInput.value : ''),
            subject: subjectInput.value,
            body: bodyInput.value
        };

        // 2. Append the JSON data as a single string field named "data"
        formData.append('data', JSON.stringify(emailData));

        // 3. Append each selected file to the FormData object
        if (attachmentsInput && attachmentsInput.files.length > 0) {
            for (const file of attachmentsInput.files) {
                formData.append('attachments', file);
            }
        }

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();

            if (data.status === 'success') {
                displayMessage(data.message, 'success', messageElement);
                formElement.reset();
                updateAllDashboardData();

                if (formElement.id === 'modalSendMailForm') {
                    setTimeout(() => {
                        if (sendEmailModal) sendEmailModal.style.display = 'none';
                        if (modalMailMessage) modalMailMessage.style.display = 'none';
                    }, 2000);
                }
            } else {
                displayMessage(data.message, 'error', messageElement);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            displayMessage('An unexpected error occurred. Please try again.', 'error', messageElement);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }


    // --- Event Listeners ---
    if ($$('.sidebar-nav .nav-link')) {
        $$('.sidebar-nav .nav-link').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                $$('.sidebar-nav .nav-link').forEach(navLink => navLink.classList.remove('active'));
                a.classList.add('active');

                const targetSectionId = a.dataset.section;
                $$('.main-content-sections > section').forEach(section => {
                    section.style.display = 'none';
                    section.classList.remove('active');
                });
                const targetElement = $(`#section-${targetSectionId}`);
                if (targetElement) {
                    targetElement.style.display = 'grid'; // Use grid for active sections
                    targetElement.classList.add('active');
                }

                if (targetSectionId === 'logs') {
                    updateEmailLogs(logDatePicker.value);
                }
            });
        });
    }

    if (createCampaignBtn) {
        createCampaignBtn.addEventListener('click', () => {
            if (sendEmailModal) sendEmailModal.style.display = 'flex';
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            if (sendEmailModal) sendEmailModal.style.display = 'none';
            if (modalSendMailForm) modalSendMailForm.reset();
            if (modalMailMessage) modalMailMessage.style.display = 'none';
        });
    }

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

    if (sendMailForm) {
        sendMailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFormSubmit(sendMailForm, mainMailMessage);
        });
    }

    if (modalSendMailForm) {
        modalSendMailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFormSubmit(modalSendMailForm, modalMailMessage);
        });
    }

    if (logDatePicker) {
        logDatePicker.addEventListener('change', () => {
            const selectedDate = logDatePicker.value;
            updateEmailLogs(selectedDate);
        });
    }

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

    const todayIST = getTodayISTDate();
    if (logDatePicker) logDatePicker.value = todayIST;
    if (todayDateSpan) todayDateSpan.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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

    updateAllDashboardData();
    setInterval(updateAllDashboardData, 30000); // Refresh every 30 seconds
});