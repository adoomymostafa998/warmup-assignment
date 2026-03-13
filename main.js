const fs = require("fs");

/* ------------------ HELPER FUNCTIONS ------------------ */

function parseTime12(timeStr) {
    let [time, period] = timeStr.trim().split(" ");
    let [h, m, s] = time.split(":").map(Number);
    if (period.toLowerCase() === "pm" && h !== 12) h += 12;
    if (period.toLowerCase() === "am" && h === 12) h = 0;
    return h * 3600 + m * 60 + s;
}

function secondsToHMS(sec) {
    if (sec < 0) sec = 0;
    let h = Math.floor(sec / 3600);
    sec %= 3600;
    let m = Math.floor(sec / 60);
    let s = sec % 60;
    return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function parseHMS(str) {
    let [h, m, s] = str.split(":").map(Number);
    return h*3600 + m*60 + s;
}

function readFileLines(file) {
    if (!fs.existsSync(file)) return [];
    let content = fs.readFileSync(file,"utf8").trim();
    if (content === "") return [];
    return content.split("\n");
}

function writeFileLines(file, lines) {
    fs.writeFileSync(file, lines.join("\n"));
}

function getMonth(dateStr){
    return Number(dateStr.split("-")[1]);
}

function getDayName(dateStr){
    let d = new Date(dateStr);
    return d.toLocaleDateString("en-US",{weekday:"long"});
}

function isEid(dateStr){
    let d = new Date(dateStr);
    let start = new Date("2025-04-10");
    let end = new Date("2025-04-30");
    return d>=start && d<=end;
}

/* ------------------ FUNCTION 1 ------------------ */
function getShiftDuration(startTime,endTime){
    let start = parseTime12(startTime);
    let end = parseTime12(endTime);
    return secondsToHMS(end-start);
}

/* ------------------ FUNCTION 2 ------------------ */
function getIdleTime(startTime,endTime){
    let start = parseTime12(startTime);
    let end = parseTime12(endTime);
    let startDelivery = 8*3600;
    let endDelivery = 22*3600;
    let idle = 0;
    if(start < startDelivery){
        idle += Math.min(end, startDelivery) - start;
    }
    if(end > endDelivery){
        idle += end - Math.max(start, endDelivery);
    }
    return secondsToHMS(idle);
}

/* ------------------ FUNCTION 3 ------------------ */
function getActiveTime(shiftDuration, idleTime){
    let shift = parseHMS(shiftDuration);
    let idle = parseHMS(idleTime);
    return secondsToHMS(shift - idle);
}

/* ------------------ FUNCTION 4 ------------------ */
function metQuota(date, activeTime){
    let active = parseHMS(activeTime);
    let quota = isEid(date) ? 6*3600 : (8*3600 + 24*60);
    return active >= quota;
}

/* ------------------ FUNCTION 5 ------------------ */
function addShiftRecord(textFile, shiftObj){
    let lines = readFileLines(textFile);

    for(let line of lines){
        let parts = line.split(",");
        if(parts[0] === shiftObj.driverID && parts[2] === shiftObj.date){
            return {};
        }
    }

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quota = metQuota(shiftObj.date, activeTime);

    let newObj = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quota,
        hasBonus: false
    };

    let newLine = [
        newObj.driverID,
        newObj.driverName,
        newObj.date,
        newObj.startTime,
        newObj.endTime,
        newObj.shiftDuration,
        newObj.idleTime,
        newObj.activeTime,
        newObj.metQuota,
        newObj.hasBonus
    ].join(",");

    let insertIndex = lines.length;
    for(let i=lines.length-1;i>=0;i--){
        if(lines[i].split(",")[0] === shiftObj.driverID){
            insertIndex = i+1;
            break;
        }
    }

    lines.splice(insertIndex, 0, newLine);
    writeFileLines(textFile, lines);

    return newObj;
}

/* ------------------ FUNCTION 6 ------------------ */
function setBonus(textFile, driverID, date, newValue){
    let lines = readFileLines(textFile);
    for(let i=0;i<lines.length;i++){
        let parts = lines[i].split(",");
        if(parts[0] === driverID && parts[2] === date){
            parts[9] = String(newValue);
            lines[i] = parts.join(",");
        }
    }
    writeFileLines(textFile, lines);
}

/* ------------------ FUNCTION 7 ------------------ */
function countBonusPerMonth(textFile, driverID, month){
    let lines = readFileLines(textFile);
    let m = Number(month);
    let exists = false;
    let count = 0;
    for(let line of lines){
        let p = line.split(",");
        if(p[0] === driverID){
            exists = true;
            if(getMonth(p[2]) === m && p[9] === "true") count++;
        }
    }
    if(!exists) return -1;
    return count;
}

/* ------------------ FUNCTION 8 ------------------ */
function getTotalActiveHoursPerMonth(textFile, driverID, month){
    let lines = readFileLines(textFile);
    let total = 0;
    for(let line of lines){
        let p = line.split(",");
        if(p[0] === driverID && getMonth(p[2]) === month){
            total += parseHMS(p[7]);
        }
    }
    return secondsToHMS(total);
}

/* ------------------ FUNCTION 9 ------------------ */
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month){
    let shifts = readFileLines(textFile);
    let rates = readFileLines(rateFile);
    let dayOff = null;
    for(let r of rates){
        let p = r.split(",");
        if(p[0] === driverID) dayOff = p[1];
    }

    let total = 0;
    for(let line of shifts){
        let p = line.split(",");
        let date = p[2];
        if(p[0] === driverID && getMonth(date) === month){
            let day = getDayName(date);
            if(day !== dayOff){
                total += isEid(date) ? 6*3600 : (8*3600 + 24*60);
            }
        }
    }

    total -= bonusCount * 2 * 3600;
    if(total < 0) total = 0;
    return secondsToHMS(total);
}

/* ------------------ FUNCTION 10 ------------------ */
function getNetPay(driverID, actualHours, requiredHours, rateFile){
    let rates = readFileLines(rateFile);
    let basePay = 0, tier = 0;
    for(let r of rates){
        let p = r.split(",");
        if(p[0] === driverID){
            basePay = Number(p[2]);
            tier = Number(p[3]);
        }
    }

    let allowed = {1:50, 2:20, 3:10, 4:3};
    let actual = parseHMS(actualHours);
    let required = parseHMS(requiredHours);

    if(actual >= required) return basePay;

    let missing = (required - actual)/3600 - allowed[tier];
    if(missing <= 0) return basePay;

    let billable = Math.floor(missing);
    let deductionRate = Math.floor(basePay / 185);
    let deduction = billable * deductionRate;

    return basePay - deduction;
}

/* ------------------ EXPORT ------------------ */
module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
