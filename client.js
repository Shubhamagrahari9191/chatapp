// Replace with your Render backend URL after deployment if needed
// For now, we use a relative path which works for both local and deployed (if served from same origin)
const socket = io('/', {
    reconnectionDefaults: {
        minDelay: 1000,
        maxDelay: 5000
    }
});

// DOM Elements
const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp');
const messageContainer = document.querySelector(".container");
const mediaBtn = document.getElementById('media-btn');
const mediaInput = document.getElementById('media-input');
const emojiBtn = document.getElementById('emoji-btn');

// UI Elements for Security/Admin
const waitingScreen = document.getElementById('waiting-screen');
const adminRequestsDiv = document.getElementById('admin-requests');
const requestsList = document.getElementById('requests-list');
const statusText = document.getElementById('status-text');

// Audio
var audio = new Audio('notef2.mp3');

// --- Join Logic ---
// For a better UX, we could make a join form, but prompts are quick for now.
let name, room;
while (!name) {
    name = prompt("Enter your name to join");
}
// Default room if not specified (optional feature)
room = prompt("Enter room name (or leave empty for 'General')") || "General";

// Show waiting screen immediately upon attempting to join
showWaitingScreen();

// Emit join request
socket.emit('join-request', { name, room });


// --- Socket Events ---

// 1. Join Flow
socket.on('join-pending', (msg) => {
    // Server acknowledges request, tells us to wait
    showWaitingScreen();
    statusText.innerText = "Waiting for approval...";
    statusText.style.color = "#ff9800";
});

socket.on('join-success', (user) => {
    // We are approved (or auto-approved as first user/admin)
    hideWaitingScreen();
    append(`You joined ${room} as ${user.role}`, 'right');
    statusText.innerText = `Connected (${user.role})`;
    statusText.style.color = "#4caf50";

    // If we are admin, show the requests panel if there are any (logic handled by specific events)
    if (user.role === 'admin') {
        adminRequestsDiv.style.display = 'block';
    }
});

// 2. Admin Logic
socket.on('admin-notification', (msg) => {
    // General notifications for admin
    alert(msg); // Fallback or use a toast
});

socket.on('approval-request', ({ socketId, name, room }) => {
    addJoinRequest(socketId, name, room);
});

// 3. Chat Logic
socket.on('user-joined', params => {
    const userName = typeof params === 'object' ? params.name : params;
    append(`${userName} joined the chat`, 'right');
});

socket.on('receive', data => {
    if (data.type === 'image') {
        append(data.message, 'left', 'image');
    } else if (data.type === 'file') {
        append({ file: data.message, fileName: data.fileName }, 'left', 'file');
    } else {
        append(`${data.name}: ${data.message}`, 'left', 'text');
    }
});

socket.on('left', data => {
    append(`${data.name} left the chat`, 'right');
});

// --- UI Helper Functions ---

function showWaitingScreen() {
    waitingScreen.style.display = 'flex';
}

function hideWaitingScreen() {
    waitingScreen.style.display = 'none';
}

function addJoinRequest(socketId, requesterName, requesterRoom) {
    // Create request item
    const item = document.createElement('div');
    item.classList.add('request-item');
    item.id = `req-${socketId}`;
    item.innerHTML = `
        <span><b>${requesterName}</b> wants to join</span>
        <div class="request-actions">
            <button class="btn-approve" onclick="approveUser('${socketId}', '${requesterRoom}')">Allow</button>
            <button class="btn-deny" onclick="denyUser('${socketId}', '${requesterRoom}')">Deny</button>
        </div>
    `;
    requestsList.appendChild(item);

    // Ensure container is visible
    adminRequestsDiv.style.display = 'block';
}

// Global functions for HTML onclick (or could add event listeners)
window.approveUser = function (socketId, room) {
    socket.emit('approve-join', { socketId, room });
    removeRequestElement(socketId);
};

window.denyUser = function (socketId, room) {
    // distinct event or just ignore? let's emit deny
    socket.emit('deny-join', { socketId, room });
    removeRequestElement(socketId);
};

function removeRequestElement(socketId) {
    const el = document.getElementById(`req-${socketId}`);
    if (el) el.remove();
    // Hide container if empty
    if (requestsList.children.length === 0) {
        // We might want to keep it open or hide it.
        // adminRequestsDiv.style.display = 'none'; 
    }
}


// --- Message Handling ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value;
    if (message.trim() !== "") {
        append(`You: ${message}`, 'right');
        socket.emit('send', message);
        messageInput.value = '';
    }
});

function append(message, position, type = 'text') {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(position);

    const content = document.createElement('div');

    if (type === 'image') {
        const img = document.createElement('img');
        img.src = message;
        img.classList.add('media-preview');
        img.onclick = () => {
            const w = window.open("");
            w.document.write(img.outerHTML);
        };
        content.appendChild(img);
    } else if (type === 'file') {
        const fileData = message.file || message;
        const fileName = message.fileName || 'Download File';

        const link = document.createElement('a');
        link.href = fileData;
        link.download = fileName;
        link.innerText = `📄 ${fileName}`;
        link.style.color = '#fff';
        link.style.textDecoration = 'underline';
        link.style.fontWeight = 'bold';

        if (position === 'left') {
            link.style.color = 'var(--primary-color)';
        }

        content.appendChild(link);
    } else {
        content.innerText = message;
    }

    // Add content BEFORE timestamp
    messageElement.appendChild(content);

    // Timestamp
    const time = document.createElement('small');
    time.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageElement.appendChild(time);

    messageContainer.append(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    if (position === 'left') {
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
}

// --- Media Sharing ---
mediaBtn.addEventListener('click', () => mediaInput.click());

mediaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Simple validation
    if (file.size > 1024 * 1024 * 1024) { // 1GB limit
        alert('File is too large (Max 1GB)');
        return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
        const fileData = evt.target.result;
        // Check if image
        const isImage = file.type.startsWith('image/');
        const type = isImage ? 'image' : 'file';

        if (isImage) {
            append(fileData, 'right', 'image');
            socket.emit('send-media', { file: fileData, fileName: file.name, type: 'image' });
        } else {
            // For generic files, we pass the data and filename
            // We append a link for ourselves too
            append({ file: fileData, fileName: file.name }, 'right', 'file');
            socket.emit('send-media', { file: fileData, fileName: file.name, type: 'file' });
        }
    };
    reader.readAsDataURL(file);
    // Reset input
    mediaInput.value = '';
});

// --- Emoji ---
// Ensure the library is loaded
if (window.EmojiButton) {
    const picker = new EmojiButton({
        position: 'top-start'
    });

    picker.on('emoji', emoji => {
        messageInput.value += emoji;
    });

    emojiBtn.addEventListener('click', () => {
        picker.togglePicker(emojiBtn);
    });
}
