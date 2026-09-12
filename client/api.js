const API_URL = (() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
        return "";
    }
    return "/api";
})();

async function apiRequest(path, options = {}) {
    try {
        const res = await fetch(API_URL + path, {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            credentials: "include",
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        const data = await res.json();
        return data;
    } catch (err) {
        console.error("API error:", err);
        return {
            success: false,
            message: "Unable to reach server. Please try again in a moment."
        };
    }
}

async function signup(name, email, password) {
    return apiRequest("/signup", {
        method: "POST",
        body: { name, email, password }
    });
}

async function login(email, password) {
    return apiRequest("/login", {
        method: "POST",
        body: { email, password }
    });
}

async function logout() {
    return apiRequest("/logout", { method: "POST" });
}

async function getMe() {
    return apiRequest("/me");
}

async function createMeeting() {
    return apiRequest("/create-meeting", { method: "POST" });
}

async function scheduleMeeting(title, time) {
    return apiRequest("/schedule-meeting", {
        method: "POST",
        body: { title, time }
    });
}

async function getScheduledMeetings() {
    return apiRequest("/scheduled-meetings");
}

async function startMeeting(meetingId) {
    return apiRequest(`/start-meeting/${meetingId}`, {
        method: "POST"
    });
}
