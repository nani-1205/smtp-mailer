document.addEventListener('DOMContentLoaded', () => {
    const sendMailForm = document.getElementById('sendMailForm');
    const mailMessage = document.getElementById('mailMessage');
    const sentCountSpan = document.getElementById('sentCount');
    const limitCountSpan = document.getElementById('limitCount');
    const remainingCountSpan = document.getElementById('remainingCount');
    const mailProgressBar = document.getElementById('mailProgressBar');
    const emailLogsTableBody = document.querySelector('#emailLogsTable tbody');

    // Function to display messages
    function displayMessage(message, type) {
        mailMessage.textContent = message;
        mailMessage.className = `message-area ${type}`;
        setTimeout(() => {
            mailMessage.textContent = '';
            mailMessage.className = 'message-area';
        }, 5000); // Clear message after 5 seconds
    }

    // Function to fetch and update daily limit
    async function updateDailyLimit() {
        try {
            const response = await fetch('/api/limit');
            const data = await response.json();

            if (data.status === 'success') {
                const { current_count, limit, remaining } = data.data;
                sentCountSpan.textContent = current_count;
                limitCountSpan.textContent = limit;
                remainingCountSpan.textContent = remaining;

                const percentage = (current_count / limit) * 100;
                mailProgressBar.style.width = `${Math.min(percentage, 100)}%`; // Cap at 100%
                mailProgressBar.style.backgroundColor = percentage >= 90 ? 'var(--error-color)' : 'var(--secondary-color)';
            } else {
                console.error('Failed to fetch daily limit:', data.message);
                displayMessage('Failed to load daily limit data.', 'error');
            }
        } catch (error) {
            console.error('Error fetching daily limit:', error);
            displayMessage('Error connecting to server for limit data.', 'error');
        }
    }

    // Function to fetch and display email logs
    async function updateEmailLogs() {
        try {
            const response = await fetch('/api/logs');
            const data = await response.json();

            if (data.status === 'success') {
                emailLogsTableBody.innerHTML = ''; // Clear existing logs
                data.data.forEach(log => {
                    const row = emailLogsTableBody.insertRow();
                    row.insertCell().textContent = log.id;
                    row.insertCell().textContent = log.sent_to;
                    row.insertCell().textContent = log.subject;
                    row.insertCell().textContent = log.body_preview;
                    
                    const statusCell = row.insertCell();
                    statusCell.textContent = log.status;
                    statusCell.classList.add(log.status.toLowerCase()); // Add class for styling (e.g., 'success', 'failed')

                    const sentAt = new Date(log.sent_at).toLocaleString();
                    row.insertCell().textContent = sentAt;
                });
            } else {
                console.error('Failed to fetch email logs:', data.message);
                displayMessage('Failed to load email logs.', 'error');
            }
        } catch (error) {
            console.error('Error fetching email logs:', error);
            displayMessage('Error connecting to server for log data.', 'error');
        }
    }

    // Handle form submission
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
                updateDailyLimit(); // Refresh limit data
                updateEmailLogs(); // Refresh logs
            } else {
                displayMessage(data.message, 'error');
            }
        } catch (error) {
            console.error('Error sending email:', error);
            displayMessage('An unexpected error occurred. Please try again.', 'error');
        }
    });

    // Initial load of data
    updateDailyLimit();
    updateEmailLogs();

    // Optionally, refresh data periodically
    setInterval(updateDailyLimit, 30000); // Every 30 seconds
    setInterval(updateEmailLogs, 60000); // Every 60 seconds
});