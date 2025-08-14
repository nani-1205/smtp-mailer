document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const sendMailForm = document.getElementById('sendMailForm');
    const mailMessage = document.getElementById('mailMessage'); // This element initially has display: none;

    // Overview Section
    const overviewSentCount = document.getElementById('overviewSentCount');
    const overviewRemainingCount = document.getElementById('overviewRemainingCount');

    // Daily Limit Section (from #daily-limit section, still updated for consistency)
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
        mailMessage.style.display = 'block'; // Ensure it's visible when a message is displayed
        setTimeout(() => {
            mailMessage.textContent = '';
            mailMessage.className = 'message-area';
            mailMessage.style.display = 'none'; // Hide it after message clears
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

                // Update Overview Section summary cards
                overviewSentCount.textContent = current_count;
                overviewRemainingCount.textContent = remaining;

                // Update Daily Limit Section (if user navigates there)
                sentCountSpan.textContent = current_count;
                limitCountSpan.textContent = limit;
                remainingCountSpan.textContent = remaining;

                const percentage = (current_count / limit) * 100;
                mailProgressBar.style.width = `${Math.min(percentage, 100)}%`;
                // Use a warning color if close to limit, error if exceeded
                if (percentage >= 100) {
                    mailProgressBar.style.backgroundColor = 'var(--error-color)';
                } else if (percentage >= 90) {
                    mailProgressBar.style.backgroundColor = 'var(--warning-color)';
                } else {
                    mailProgressBar.style.backgroundColor = 'var(--primary-color)';
                }

                // Update Daily Usage Chart
                updateDailyUsageChart(current_count, limit);

            } else {
                console.error('Failed to fetch daily limit:', data.message);
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
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
                    // Apply new status classes for styling
                    statusCell.classList.add(`status-${log.status.toLowerCase()}`);

                    row.insertCell().textContent = formatDate(log.sent_at);
                });
            } else {
                console.error('Failed to fetch email logs:', data.message);
            }
        } catch (error) {
            console.error('Error fetching email logs:', error);
        }
    }

    async function updateStatusDistributionChart() {
        try {
            const response = await fetch('/api/stats/status-distribution');
            const data = await response.json();

            if (data.status === 'success') {
                const successCount = data.data.Success || 0;
                const failedCount = data.data.Failed || 0;

                // Ensure initial data for chart, even if counts are zero
                const chartData = [successCount, failedCount];
                const total = successCount + failedCount;

                if (statusDistributionChart) {
                    statusDistributionChart.data.datasets[0].data = chartData;
                    statusDistributionChart.update();
                } else {
                    const ctx = document.getElementById('statusDistributionChart').getContext('2d');
                    statusDistributionChart = new Chart(ctx, {
                        type: 'pie',
                        data: {
                            labels: ['Success', 'Failed'],
                            datasets: [{
                                data: chartData,
                                backgroundColor: [
                                    'rgba(34, 197, 94, 0.8)', // Corresponds to --secondary-color for success
                                    'rgba(239, 68, 68, 0.8)'  // Corresponds to --error-color for failed
                                ],
                                borderWidth: 0 // As per new design
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false, // Important for consistent sizing
                            plugins: {
                                legend: {
                                    position: 'bottom',
                                    labels: {
                                        padding: 20,
                                        font: {
                                            family: 'Inter',
                                            size: 12,
                                            weight: '500'
                                        }
                                    }
                                },
                                title: {
                                    display: false, // Title is handled by HTML chart-title div
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
                                backgroundColor: 'rgba(99, 102, 241, 0.8)', // Corresponds to --primary-color
                                borderRadius: 8, // As per new design
                                borderSkipped: false, // As per new design
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false, // Important for consistent sizing
                            plugins: {
                                legend: {
                                    display: false, // As per new design
                                },
                                title: {
                                    display: false, // Title is handled by HTML chart-title div
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: 'rgba(226, 232, 240, 0.5)' // As per new design
                                    },
                                    ticks: {
                                        precision: 0, // Ensure integer ticks for count
                                        font: {
                                            family: 'Inter', // As per new design
                                            size: 11
                                        }
                                    }
                                },
                                x: {
                                    grid: {
                                        display: false // As per new design
                                    },
                                    ticks: {
                                        font: {
                                            family: 'Inter', // As per new design
                                            size: 11
                                        }
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
        // Ensure data is present for chart, even if counts are zero
        const chartData = [currentCount, Math.max(0, limit - currentCount)]; // Ensure remaining is not negative

        if (dailyUsageChart) {
            dailyUsageChart.data.datasets[0].data = chartData;
            dailyUsageChart.update();
        } else {
            const ctx = document.getElementById('dailyUsageChart').getContext('2d');
            dailyUsageChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Sent', 'Remaining'],
                    datasets: [{
                        data: chartData,
                        backgroundColor: [
                            'rgba(99, 102, 241, 0.8)', // Corresponds to --primary-color
                            'rgba(226, 232, 240, 0.8)' // Light gray for remaining, as per new design
                        ],
                        borderWidth: 0, // As per new design
                        cutout: '70%' // As per new design
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Important for consistent sizing
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                font: {
                                    family: 'Inter', // As per new design
                                    size: 12,
                                    weight: '500'
                                }
                            }
                        },
                        title: {
                            display: false, // Title is handled by HTML chart-title div
                        }
                    }
                }
            });
        }
    }

    // --- Event Listeners ---

    // Sidebar navigation
    document.querySelectorAll('.nav-link').forEach(link => { // Select by new class nav-link
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(nav => nav.classList.remove('active'));
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
                updateAllDashboardData(); // Refresh all dashboard data
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