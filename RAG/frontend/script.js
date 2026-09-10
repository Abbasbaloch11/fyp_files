document.addEventListener('DOMContentLoaded', () => {
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const agentItems = document.querySelectorAll('.agent-list li');
    const routingStatus = document.getElementById('routing-status');
    
    let currentAgent = "supervisor";

    // Initialize Chart.js with global dark theme defaults
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.borderColor = '#2e2e3d';

    // 1. Bar Chart (Student Statistics)
    const ctxBar = document.getElementById('barChart').getContext('2d');
    let barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Admissions',
                data: [65, 59, 80, 81, 56, 55],
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // 2. Line Chart (CGPA Trend)
    const ctxLine = document.getElementById('lineChart').getContext('2d');
    let lineChart = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'],
            datasets: [{
                label: 'CGPA',
                data: [3.2, 3.4, 3.1, 3.6, 3.8],
                borderColor: '#10b981',
                tension: 0.4,
                fill: false
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // 3. Doughnut Chart (Attendance)
    const ctxDoughnut = document.getElementById('doughnutChart').getContext('2d');
    let doughnutChart = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent', 'Leave'],
            datasets: [{
                data: [75, 15, 10],
                backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, cutout: '75%', plugins: { legend: { position: 'bottom' } } }
    });

    // Handle Agent Selection
    agentItems.forEach(item => {
        item.addEventListener('click', () => {
            agentItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentAgent = item.getAttribute('data-agent');
            routingStatus.innerText = `Routed via: ${item.querySelector('.agent-name').innerText}`;
        });
    });

    // Handle Sending Messages
    const sendMessage = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // Append User Message
        appendMessage(text, 'user-msg');
        chatInput.value = '';

        // Show typing indicator
        const typingId = appendMessage('AI is thinking...', 'bot-msg');

        try {
            // Update this URL to match your backend API endpoint (e.g. FastAPI / Flask)
            const response = await fetch('http://localhost:8000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, agent: currentAgent })
            });
            
            const data = await response.json();
            
            // Remove typing indicator
            document.getElementById(typingId).remove();
            
            // Append Bot Message
            appendMessage(data.reply || "Sorry, I couldn't process that.", 'bot-msg');

            // --- REAL DATA INTEGRATION (Dynamic Graphs) ---
            // If your backend detects a request for graphs, have it return a `chartData` object
            // Example Backend JSON: { "reply": "Here is the CGPA trend.", "chartData": { "target": "cgpa", "data": [3.0, 3.5, 3.2, 3.8] } }
            if (data.chartData) {
                updateChartsWithRealData(data.chartData);
            }

        } catch (error) {
            document.getElementById(typingId).remove();
            appendMessage("Connection error. Ensure the backend is running.", 'bot-msg');
        }
    };

    // Helper to append messages
    const appendMessage = (text, className) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${className}`;
        msgDiv.id = `msg-${Date.now()}`;
        msgDiv.innerText = text;
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return msgDiv.id;
    };

    // Helper to update charts dynamically with your RAG integrated data
    const updateChartsWithRealData = (chartPayload) => {
        if (chartPayload.target === 'cgpa' && chartPayload.data) {
            lineChart.data.datasets[0].data = chartPayload.data;
            lineChart.update();
        } else if (chartPayload.target === 'attendance' && chartPayload.data) {
            doughnutChart.data.datasets[0].data = chartPayload.data;
            doughnutChart.update();
        }
        // Add more targets mapping to your different RAG databases
    };

    // Event Listeners for Input
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});
