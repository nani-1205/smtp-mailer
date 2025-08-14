document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const sendMailForm = document.getElementById('sendMailForm');
    const mailMessage = document.getElementById('mailMessage');

    // Overview Section
    const overviewSentCount = document.getElementById('overviewSentCount');
    const overviewRemainingCount = document.getElementById('overviewRemainingCount');

    // Daily Limit Section (redundant but keeping for now as per HTML)
    const sentCountSpan = document.getElementById('sentCount');
    const limitCountSpan = document.getElementById('limitCount');
    const remainingCountSpan = document.getElementById('remainingCount');
    const mailProgressBar = document.getElementById('mailProgressBar');

    // Logs Section
    const emailLogsTableBody = document.querySelector('#emailLogsTable tbody');
    const logDatePicker = document.getElementById('logDate');
    const resetLogDateBtn = document.getElementById('resetLogDate');

    // Charts
    let dailyUsageChart, statusDistributionChart, dailySendsChart;

    // --- Utility Functions ---
    function displayMessage(message, type) {
        mailMessage.textContent = message;
        mailMessage.className = `message-area ${type}`;
        setTimeout(() => {
            mailMessage.textContent = '';
            mailMessage.className = 'message-area';
        }, 5000); // Clear message after 5 seconds
    }

    function formatDate(dateString) {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        return new Date(dateString).toLocaleString('en-GB', options); // Format for Indian context (DD/MM/YYYY HH:MM:SS)
    }

    function getTodayISTDate() {
        const now = new Date();
        const istOffset = 5.5 * 60; // IST is UTC+5:30 in minutes
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000); // Convert to UTC
        const istDate = new Date(utc + (istOffset * 60000)); // Convert to IST
        return istDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    // --- API Calls & Data Rendering ---

    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;

                // Update Overview Section
                overviewSentCount.textContent = current_count;
                overviewRemainingCount.textContent = remaining;

                // Update Daily Limit Section
                sentCountSpan.textContent = current_count;
                limitCountSpan.textContent = limit;
                remainingCountSpan.textContent = remaining;

                const percentage = (current_count / limit) * 100;
                mailProgressBar.style.width = `${Math.min(percentage, 100)}%`;
                mailProgressBar.style.backgroundColor = percentage >= 90 ? 'var(--error-color)' : 'var(--primary-color)';

                // Update Daily Usage Chart
                updateDailyUsageChart(current_count, limit);

            } else {
                console.error('Failed to fetch daily limit:', data.message);
                // displayMessage('Failed to load daily limit data.', 'error'); // Don't spam messages
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
            // displayMessage('Error connecting to server for limit data.', 'error');
        }
    }

    async function updateEmailLogs(date = null, limit = null) {
        try {
            let url = '/api/logs';
            const params = [];
            if (date) {
                params.push(`date=${date}`);
            }
            if (limit) {
                params.push(`limit=${limit}`);
            }
            if (params.length > 0) {
                url += `?${params.join('&')}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'success') {
                emailLogsTableBody.innerHTML = ''; // Clear existing logs
                if (data.data.length === 0) {
                    const row = emailLogsTableBody.insertRow();
                    const cell = row.insertCell();
                    cell.colSpan = 6;
                    cell.textContent = "No logs found for this date.";
                    cell.style.textAlign = "center";
                    cell.style.padding = "20px";
                    return;
                }

                data.data.forEach(log => {
                    const row = emailLogsTableBody.insertRow();
                    row.insertCell().textContent = log.id;
                    row.insertCell().textContent = log.sent_to;
                    row.insertCell().textContent = log.subject;
                    row.insertCell().textContent = log.body_preview;

                    const statusCell = row.insertCell();
                    statusCell.textContent = log.status;
                    statusCell.classList.add(log.status.toLowerCase());

                    row.insertCell().textContent = formatDate(log.sent_at);
                });
            } else {
                console.error('Failed to fetch email logs:', data.message);
                // displayMessage('Failed to load email logs.', 'error');
            }
        } catch (error) {
            console.error('Error fetching email logs:', error);
            // displayMessage('Error connecting to server for log data.', 'error');
        }
    }

    async function updateStatusDistributionChart() {
        try {
            const response = await fetch('/api/stats/status-distribution');
            const data = await response.json();

            if (data.status === 'success') {
                const successCount = data.data.Success || 0;
                const failedCount = data.data.Failed || 0;

                if (statusDistributionChart) {
                    statusDistributionChart.data.datasets[0].data = [successCount, failedCount];
                    statusDistributionChart.update();
                } else {
                    const ctx = document.getElementById('statusDistributionChart').getContext('2d');
                    statusDistributionChart = new Chart(ctx, {
                        type: 'pie',
                        data: {
                            labels: ['Success', 'Failed'],
                            datasets: [{
                                data: [successCount, failedCount],
                                backgroundColor: [
                                    'rgba(76, 175, 80, 0.8)', // Green
                                    'rgba(244, 67, 54, 0.8)'  // Red
                                ],
                                borderColor: [
                                    'rgba(76, 175, 80, 1)',
                                    'rgba(244, 67, 54, 1)'
                                ],
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: {
                                    position: 'bottom',
                                },
                                title: {
                                    display: false,
                                    text: 'Email Status Distribution'
                                }
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching status distribution:', error);
        }
    }

    async function updateDailySendsChart() {
        try {
            const response = await fetch('/api/stats/daily-sends?days=7'); // Fetch last 7 days
            const data = await response.json();

            if (data.status === 'success') {
                const dates = Object.keys(data.data).sort(); // Get sorted dates
                const counts = dates.map(date => data.data[date]);

                if (dailySendsChart) {
                    dailySendsChart.data.labels = dates;
                    dailySendsChart.data.datasets[0].data = counts;
                    dailySendsChart.update();
                } else {
                    const ctx = document.getElementById('dailySendsChart').getContext('2d');
                    dailySendsChart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: dates,
                            datasets: [{
                                label: 'Emails Sent',
                                data: counts,
                                backgroundColor: 'rgba(106, 103, 255, 0.7)', // Primary purple
                                borderColor: 'rgba(106, 103, 255, 1)',
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: {
                                    display: false,
                                },
                                title: {
                                    display: false,
                                    text: 'Emails Sent Last 7 Days'
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        precision: 0 // Ensure integer ticks for count
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

    function updateDailyUsageChart(currentCount, limit) {
        if (dailyUsageChart) {
            dailyUsageChart.data.datasets[0].data = [currentCount, limit - currentCount];
            dailyUsageChart.update();
        } else {
            const ctx = document.getElementById('dailyUsageChart').getContext('2d');
            dailyUsageChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Sent', 'Remaining'],
                    datasets: [{
                        data: [currentCount, limit - currentCount],
                        backgroundColor: [
                            'rgba(106, 103, 255, 0.8)', // Primary purple
                            'rgba(200, 200, 200, 0.6)' // Light gray for remaining
                        ],
                        borderColor: [
                            'rgba(106, 103, 255, 1)',
                            'rgba(200, 200, 200, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    cutout: '70%', // Make it a doughnut
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                        title: {
                            display: false,
                            text: 'Daily Usage'
                        }
                    }
                }
            });
        }
    }

    // --- Event Listeners ---

    // Sidebar navigation
    document.querySelectorAll('.sidebar nav ul li a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.sidebar nav ul li a').forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            const targetId = this.getAttribute('href').substring(1);
            document.querySelectorAll('.dashboard-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
        });
    });


    // Send Mail Form Submission
    sendMailForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const to = document.getElementById('to').value;
        const subject = document.getElementById('subject').value;
        const body = document.getElementById('body').value;

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ to, subject, body }),
            });
            const data = await response.json();

            if (data.status === 'success') {
                displayMessage(data.message, 'success');
                sendMailForm.reset(); // Clear form
                // Refresh all dashboard data
                updateAllDashboardData();
            } else {
                displayMessage(data.message, 'error');
            }
        } catch (error) {
            console.error('Error sending email:', error);
            displayMessage('An unexpected error occurred. Please try again.', 'error');
        }
    });

    // Log Date Picker Change
    logDatePicker.addEventListener('change', () => {
        const selectedDate = logDatePicker.value;
        if (selectedDate) {
            updateEmailLogs(selectedDate, 50); // Show up to 50 logs for a specific date
        } else {
            // If date is cleared, revert to today's newest 5
            logDatePicker.value = getTodayISTDate(); // Set back to today
            updateEmailLogs(getTodayISTDate(), 5);
        }
    });

    // Reset Log Date Button
    resetLogDateBtn.addEventListener('click', () => {
        logDatePicker.value = getTodayISTDate(); // Set date picker to today
        updateEmailLogs(getTodayISTDate(), 5); // Fetch today's newest 5
    });

    // --- Initial Load & Refresh ---

    function updateAllDashboardData() {
        updateDailyLimit();
        updateStatusDistributionChart();
        updateDailySendsChart();
        updateEmailLogs(getTodayISTDate(), 5); // Load today's newest 5 logs on initial load
    }

    // Set default date for logs to today (IST)
    logDatePicker.value = getTodayISTDate();

    // Initial load of all dashboard data
    updateAllDashboardData();

    // Optionally, refresh dashboard data periodically
    setInterval(updateAllDashboardData, 30000); // Every 30 seconds
});