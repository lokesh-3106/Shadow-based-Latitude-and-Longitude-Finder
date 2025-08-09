let map = null;
let latestResults = null; // Store latest calculation results

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function calculateSolarDeclination(dayOfYear) {
  return 23.44 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));
}

async function getLocationName(latitude, longitude) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`);
    const data = await response.json();
    if (data && data.display_name) {
      return data.display_name;
    } else {
      return "Unknown location";
    }
  } catch (error) {
    console.error("Error fetching location name:", error);
    return "Unable to fetch location name";
  }
}

async function initializeMap(latitude, longitude) {
  try {
    // Initialize Leaflet map
    map = L.map('map').setView([latitude, longitude], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const locationName = await getLocationName(latitude, longitude);
    const marker = L.marker([latitude, longitude]).addTo(map);
    marker.bindPopup(`Calculated Location: ${locationName}`).openPopup();

    document.getElementById("locationName").innerHTML = `
      <strong>Location Name: ${locationName}</strong>
      <span class="result-description">Location name based on coordinates</span>
    `;
    // Store location name in results
    if (latestResults) {
      latestResults.locationName = locationName;
    }
  } catch (error) {
    console.error("Error initializing Leaflet map:", error.message);
    alert("Failed to load map. Check console (F12) for details. Ensure internet connection is active.");
  }
}

function calculateCoordinates() {
  const stickHeight = parseFloat(document.getElementById("stickHeight").value);
  const shadowLength = parseFloat(document.getElementById("shadowLength").value);
  const dateInput = document.getElementById("date").value;
  const timeInput = document.getElementById("solarNoon").value;
  const utcOffset = parseFloat(document.getElementById("utcOffset").value);

  if (
    isNaN(stickHeight) || stickHeight <= 0 ||
    isNaN(shadowLength) || shadowLength < 0 ||
    !dateInput || !timeInput || isNaN(utcOffset)
  ) {
    alert("Please fill in all fields with valid values (stick height, shadow length, and UTC offset must be valid numbers).");
    return;
  }

  const date = new Date(dateInput);
  const dayOfYear = getDayOfYear(date);
  const declination = calculateSolarDeclination(dayOfYear);

  let solarElevation, latitude, isZeroShadowDay = false;

  if (shadowLength === 0) {
    alert("🌞 It's Zero Shadow Day! Latitude ≈ Solar Declination.");
    solarElevation = 90;
    latitude = declination;
    isZeroShadowDay = true;
  } else {
    const angleRad = Math.atan(stickHeight / shadowLength);
    solarElevation = toDegrees(angleRad);

    const latOption1 = declination + (90 - solarElevation);
    const latOption2 = declination - (90 - solarElevation);

    latitude = (Math.abs(latOption1) <= 90) ? latOption1 : latOption2;
  }

  const [hours, minutes] = timeInput.split(":").map(Number);
  const localTime = hours + minutes / 60;
  let longitude = (12 - localTime) * 15 + (utcOffset * 15);
  longitude = ((longitude + 180) % 360) - 180;

  if (isNaN(latitude) || isNaN(longitude)) {
    alert("Invalid calculation. Please check your inputs.");
    return;
  }

  // Store results for download
  latestResults = {
    stickHeight,
    shadowLength,
    date: dateInput,
    solarNoon: timeInput,
    utcOffset,
    isZeroShadowDay,
    solarElevation: solarElevation.toFixed(2),
    declination: declination.toFixed(2),
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    locationName: "Fetching..."
  };

  document.getElementById("zeroShadowDay").innerHTML = `
    <strong>Zero Shadow Day: ${isZeroShadowDay ? 'Yes' : 'No'}</strong>
    <span class="result-description">${isZeroShadowDay ? 'Sun is directly overhead (shadow length = 0)' : 'Not a Zero Shadow Day'}</span>
  `;
  document.getElementById("solarElevation").innerHTML = `
    <strong>Solar Elevation Angle: ${solarElevation.toFixed(2)}°</strong>
    <span class="result-description">Solar elevation angle (height of sun above horizon)</span>
  `;
  document.getElementById("solarDeclination").innerHTML = `
    <strong>Solar Declination: ${declination.toFixed(2)}°</strong>
    <span class="result-description">Solar declination (sun's angular position north/south of celestial equator)</span>
  `;
  document.getElementById("latitude").innerHTML = `
    <strong>Latitude: ${latitude.toFixed(4)}°</strong>
    <span class="result-description">${isZeroShadowDay ? 'Calculated from Zero Shadow Day (Latitude ≈ Solar Declination)' : 'Calculated geographical latitude'}</span>
  `;
  document.getElementById("longitude").innerHTML = `
    <strong>Longitude: ${longitude.toFixed(4)}°</strong>
    <span class="result-description">Calculated geographical longitude (based on solar noon time)</span>
  `;

  initializeMap(latitude, longitude);
}

async function downloadPDF() {
  if (!latestResults) {
    alert("Please calculate coordinates first.");
    return;
  }

  const shadowData = [];
  const timeInputs = document.querySelectorAll(".time-input");
  const shadowInputs = document.querySelectorAll(".shadow-input");
  for (let i = 0; i < timeInputs.length; i++) {
    const time = timeInputs[i].value;
    const shadow = parseFloat(shadowInputs[i].value);
    if (time && !isNaN(shadow)) {
      shadowData.push({ time, shadow });
    }
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  // A4 page height is ~297 mm, graph is 85 mm tall, leave margin
  const pageHeight = 297;
  const graphHeight = 85;
  const marginBottom = 20;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Shadow-based Latitude & Longitude Finder Report", 105, y, { align: "center" });
  y += 15;

  // Calculation Results
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Calculation Results", 20, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const results = [
    `Stick Height: ${latestResults.stickHeight} cm`,
    `Shadow Length: ${latestResults.shadowLength} cm`,
    `Date: ${latestResults.date}`,
    `Local Solar Noon Time: ${latestResults.solarNoon}`,
    `UTC Offset: ${latestResults.utcOffset} hours`,
    `Zero Shadow Day: ${latestResults.isZeroShadowDay ? 'Yes' : 'No'}`,
    `Solar Elevation Angle: ${latestResults.solarElevation}°`,
    `Solar Declination: ${latestResults.declination}°`,
    `Latitude: ${latestResults.latitude}°`,
    `Longitude: ${latestResults.longitude}°`,
    `Location Name: ${latestResults.locationName}`
  ];
  results.forEach(line => {
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, 20, y);
    y += 8;
  });

  // Shadow Measurements
  y += 5;
  if (y > pageHeight - marginBottom) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Shadow Measurements", 20, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (shadowData.length > 0) {
    doc.text("Time\tShadow Length (cm)", 20, y);
    y += 8;
    shadowData.forEach(d => {
      if (y > pageHeight - marginBottom) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${d.time}\t${d.shadow}`, 20, y);
      y += 8;
    });
  } else {
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      y = 20;
    }
    doc.text("No shadow measurements provided.", 20, y);
    y += 8;
  }

  // Graph
  if (window.shadowChart) {
    y += 5;
    if (y > pageHeight - graphHeight - marginBottom) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Shadow Length vs. Time Graph", 20, y);
    y += 10;
    try {
      const canvas = document.getElementById("realDataChart");
      const imgData = await html2canvas(canvas).then(canvas => canvas.toDataURL('image/png'));
      doc.addImage(imgData, 'PNG', 20, y, 170, 85); // Scale to fit A4
      y += 90;
    } catch (error) {
      console.error("Error capturing graph:", error);
      if (y > pageHeight - marginBottom) {
        doc.addPage();
        y = 20;
      }
      doc.text("Unable to include graph due to an error.", 20, y);
      y += 8;
    }
  } else {
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      y = 20;
    }
    doc.text("No graph available. Please click 'Plot Graph' first.", 20, y);
    y += 8;
  }

  // Save PDF
  doc.save("ShadowFinder_Report.pdf");
}

function downloadText() {
  if (!latestResults) {
    alert("Please calculate coordinates first.");
    return;
  }

  const shadowData = [];
  const timeInputs = document.querySelectorAll(".time-input");
  const shadowInputs = document.querySelectorAll(".shadow-input");
  for (let i = 0; i < timeInputs.length; i++) {
    const time = timeInputs[i].value;
    const shadow = parseFloat(shadowInputs[i].value);
    if (time && !isNaN(shadow)) {
      shadowData.push({ time, shadow });
    }
  }

  // Generating text content
  let textContent = "Shadow-based Latitude & Longitude Finder Report\n\n";
  textContent += "Calculation Results\n";
  textContent += `Stick Height: ${latestResults.stickHeight} cm\n`;
  textContent += `Shadow Length: ${latestResults.shadowLength} cm\n`;
  textContent += `Date: ${latestResults.date}\n`;
  textContent += `Local Solar Noon Time: ${latestResults.solarNoon}\n`;
  textContent += `UTC Offset: ${latestResults.utcOffset} hours\n`;
  textContent += `Zero Shadow Day: ${latestResults.isZeroShadowDay ? 'Yes' : 'No'}\n`;
  textContent += `Solar Elevation Angle: ${latestResults.solarElevation}°\n`;
  textContent += `Solar Declination: ${latestResults.declination}°\n`;
  textContent += `Latitude: ${latestResults.latitude}°\n`;
  textContent += `Longitude: ${latestResults.longitude}°\n`;
  textContent += `Location Name: ${latestResults.locationName}\n`;
  textContent += "\nShadow Measurements\n";
  if (shadowData.length > 0) {
    textContent += "Time\tShadow Length (cm)\n";
    textContent += shadowData.map(d => `${d.time}\t${d.shadow}`).join('\n');
  } else {
    textContent += "No shadow measurements provided.\n";
  }

  // Trigger text download
  const blob = new Blob([textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ShadowFinder_Report.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function showAbout() {
  const modal = document.getElementById("aboutModal");
  modal.style.display = "flex";
}

function hideAbout() {
  const modal = document.getElementById("aboutModal");
  modal.style.display = "none";
}

function addRow() {
  const container = document.getElementById("input-container");
  const newRow = document.createElement("div");
  newRow.className = "input-row";
  newRow.innerHTML = `
    <input type="time" class="time-input">
    <input type="number" class="shadow-input" placeholder="Shadow Length (cm)">
  `;
  container.appendChild(newRow);
}

function plotRealGraph() {
  const timeInputs = document.querySelectorAll(".time-input");
  const shadowInputs = document.querySelectorAll(".shadow-input");

  const labels = [];
  const data = [];

  for (let i = 0; i < timeInputs.length; i++) {
    const time = timeInputs[i].value;
    const shadow = parseFloat(shadowInputs[i].value);
    if (time && !isNaN(shadow)) {
      labels.push(time);
      data.push(shadow);
    }
  }

  if (labels.length === 0) {
    alert("Please enter at least one valid time and shadow length to plot the graph.");
    return;
  }

  // Sort data by time for a smoother graph
  const timeDataPairs = labels.map((time, index) => ({ time, shadow: data[index] }));
  timeDataPairs.sort((a, b) => a.time.localeCompare(b.time));
  const sortedLabels = timeDataPairs.map(pair => pair.time);
  const sortedData = timeDataPairs.map(pair => pair.shadow);

  const ctx = document.getElementById("realDataChart").getContext("2d");

  if (!ctx) {
    console.error("Canvas element 'realDataChart' not found.");
    alert("Error: Graph canvas not found. Check console (F12) for details.");
    return;
  }

  if (window.shadowChart) {
    window.shadowChart.destroy();
  }

  window.shadowChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: sortedLabels,
      datasets: [{
        label: "Shadow Length (cm)",
        data: sortedData,
        borderColor: "#60a5fa",
        backgroundColor: "#93c5fd",
        fill: false,
        tension: 0.2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          title: {
            display: true,
            text: "Time (hh:mm)",
            color: "#e2e8f0",
            font: {
              family: 'Roboto',
              size: 14
            }
          },
          ticks: {
            color: "#e2e8f0"
          },
          grid: {
            color: "#4a5568"
          }
        },
        y: {
          title: {
            display: true,
            text: "Shadow Length (cm)",
            color: "#e2e8f0",
            font: {
              family: 'Roboto',
              size: 14
            }
          },
          ticks: {
            color: "#e2e8f0"
          },
          grid: {
            color: "#4a5568"
          },
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          labels: {
            color: "#e2e8f0",
            font: {
              family: 'Roboto',
              size: 14
            }
          }
        }
      }
    }
  });
}