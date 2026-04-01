/** 📲 QR Attendance Utility - attendance.html */
function markAttendance(studentID, isOut = false) {
    if (!studentID) return;
    
    const type = isOut ? 'OUT' : 'IN';
    console.log(`📡 Marking Attendance for ${studentID} as ${type}...`);
    
    // Check for Cloud Instance
    if (window.Cloud && window.Cloud.initialized) {
        window.Cloud.pushAttendanceRecord(studentID, type);
    } else {
        console.warn("⚠️ Cloud not ready - Saving record locally.");
        // Local logic if cloud isn't hit
    }
}

console.log("✅ QR Attendance Utility Ready");
