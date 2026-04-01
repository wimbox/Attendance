/** 🆔 ID Generator Utility - attendance.html */
function generateUniqueID() {
    return 'ID-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/** 🕒 Date Formatting Helper */
function getLocalDateString() {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

console.log("✅ ID Generator Utility Ready");
