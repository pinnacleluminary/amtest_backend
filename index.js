const Anthropic = require("@anthropic-ai/sdk");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const fontPath = path.join(__dirname, './assets/Helvetica.ttf');
const fontBoldPath = path.join(__dirname, './assets/Helvetica-Bold.ttf');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into Supabase
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password: hashedPassword }])
      .select();

    if (error) throw error;

    // Create JWT token
    const token = jwt.sign({ userId: data[0].id }, process.env.JWT_SECRET);

    res.json({ token, user: { id: data[0].id, email: data[0].email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Function to generate graphs using Chart.js
async function generateGraphs(graphData) {
  try {
    const width = 800;
    const height = 400;
    const backgroundColour = 'white';
    
    // Configure ChartJS with better font settings
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width, 
      height, 
      backgroundColour
    });

    const graphs = [];

    for (const graph of graphData) {
      // Generate chart configuration with improved font settings
      const configuration = {
        type: graph.type || 'line',
        data: {
          labels: graph.labels,
          datasets: graph.datasets.map(dataset => ({
            label: dataset.label,
            data: dataset.data,
            backgroundColor: dataset.backgroundColor || 'rgba(54, 162, 235, 0.2)',
            borderColor: dataset.borderColor || 'rgba(54, 162, 235, 1)',
            borderWidth: dataset.borderWidth || 1,
            pointBackgroundColor: dataset.pointBackgroundColor || 'rgba(54, 162, 235, 1)',
            pointBorderColor: dataset.pointBorderColor || '#fff',
            pointRadius: dataset.pointRadius || 4,
            fill: dataset.fill !== undefined ? dataset.fill : false
          }))
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: Buffer.from(graph.title || 'Chart', 'utf8'),
              font: {
                family: 'Arial, Helvetica, sans-serif',
                size: 18,
                weight: 'bold'
              },
              padding: 20
            },
            legend: {
              display: true,
              position: 'top',
              labels: {
                font: {
                  family: 'Arial, Helvetica, sans-serif',
                  size: 14
                },
                padding: 15
              }
            },
            tooltip: {
              titleFont: {
                family: 'Arial, Helvetica, sans-serif',
                size: 14
              },
              bodyFont: {
                family: 'Arial, Helvetica, sans-serif',
                size: 12
              },
              padding: 10
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: Buffer.from(graph.xAxisLabel || '', 'utf8'),
                font: {
                  family: 'Arial, Helvetica, sans-serif',
                  size: 14,
                  weight: 'bold'
                },
                padding: {top: 10, bottom: 10}
              },
              ticks: {
                font: {
                  family: 'Arial, Helvetica, sans-serif',
                  size: 12
                },
                padding: 8
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.1)'
              }
            },
            y: {
              title: {
                display: true,
                text: Buffer.from(graph.yAxisLabel || ''),
                font: {
                  family: 'Arial, Helvetica, sans-serif',
                  size: 14,
                  weight: 'bold'
                },
                padding: {top: 10, bottom: 10}
              },
              ticks: {
                font: {
                  family: 'Arial, Helvetica, sans-serif',
                  size: 12
                },
                padding: 8
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.1)'
              },
              beginAtZero: graph.beginAtZero !== undefined ? graph.beginAtZero : true
            }
          },
          layout: {
            padding: {
              left: 15,
              right: 15,
              top: 15,
              bottom: 15
            }
          },
          elements: {
            line: {
              tension: 0.4 // Smoother curves
            },
            point: {
              radius: 4,
              hoverRadius: 6
            }
          }
        }
      };

      // Generate image buffer
      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
      const imageBase64 = imageBuffer.toString('base64');

      graphs.push({
        title: graph.title || 'Chart',
        imageBase64: imageBase64
      });
    }

    return graphs;
  } catch (error) {
    console.error('Error generating graphs:', error);
    return [];
  }
}


async function createPDF(reportData, graphs) {
  return new Promise((resolve, reject) => {
    try {
      const pdfFilename = `test_report_${Date.now()}.pdf`;
      const pdfPath = path.join(tempDir, pdfFilename);

      // Create PDF document with A4 size
      const doc = new PDFDocument({
        margins: { top: 20, bottom: 20, left: 25, right: 25 },
        size: 'A4',
        bufferPages: true
      });

      doc.registerFont('Helvetica', fontPath);
      doc.registerFont('Helvetica-Bold', fontBoldPath);

      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // Document properties
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 50; // Content width accounting for margins
      const pageHeight = doc.page.height;

      const topPadding = 15; // Additional padding at the top
      let current_Y = 20 + topPadding; // Start Y position with extra padding

      // HEADER SECTION - Replace text with logo image
      // Load the logo image from assets folder
      const logoPath = path.join(__dirname, './assets/logo.png');

      // Add logo image instead of text
      doc.image(logoPath, 25, current_Y, {
        width: 80, // Adjust width as needed to fit your logo
        height: 30 // Adjust height as needed to fit your logo
      });

      // Get title from test data
      const testTitle = reportData.testInfo?.testType || 'Material Test Report';

      const centerX = pageWidth / 2;

      // Report title - centered like in the example and made BOLD
      doc.fontSize(12).font('Helvetica-Bold')
        .fillColor('#333333')
        .text(testTitle, centerX - 150, current_Y, {
          width: 300,
          align: 'center'
        });

      // Add current date in header - right aligned
      const currentDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      doc.fontSize(10).font('Helvetica')
        .fillColor('#333333')
        .text(currentDate, pageWidth - 100, current_Y, {
          align: 'right'
        });

      let currentY = 75;

      // SIMPLIFY ALL TEST INFO AND CALCULATED PROPERTIES
      // Convert any complex values to simple strings
      const simplifyValue = (value) => {
        if (value === null || value === undefined) return '';
        if (typeof value !== 'object') return String(value);
        if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
        if (typeof value === 'object') {
          if (value.value !== undefined) return String(value.value);
          if (Object.keys(value).length === 0) return '';
          return JSON.stringify(value);
        }
        return String(value);
      };

      // Format property name from camelCase to title case
      const formatPropertyName = (key) => {
        // Handle special cases like "testType" -> "Test Type"
        return key
          .replace(/([A-Z])/g, ' $1') // Insert space before capital letters
          .replace(/^./, str => str.toUpperCase())
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Simplify all test info
      const simplifiedTestInfo = {};
      if (reportData.testInfo) {
        Object.entries(reportData.testInfo).forEach(([key, value]) => {
          // Use formatted property name as the key
          simplifiedTestInfo[formatPropertyName(key)] = simplifyValue(value);
        });
      }

      // Simplify all calculated properties
      const simplifiedProperties = {};
      if (reportData.calculatedProperties) {
        Object.entries(reportData.calculatedProperties).forEach(([key, value]) => {
          // Use formatted property name as the key
          simplifiedProperties[formatPropertyName(key)] = simplifyValue(value);
        });
      }

      // TEST INFORMATION TABLE - Smaller text but showing all info
      if (Object.keys(simplifiedTestInfo).length > 0) {
        // Section title with light blue background
        doc.rect(25, currentY, contentWidth, 20)
          .fillColor('#e6e6e6')
          .fill();

        doc.strokeColor('#000000')
          .lineWidth(0.5)
          .rect(25, currentY, contentWidth, 20)
          .stroke();

        doc.fontSize(10).font('Helvetica-Bold')
          .fillColor('#003366')
          .text('Test Information', 30, currentY + 6);

        currentY += 20;

        // Use 2-column layout with smaller text
        const testInfoKeys = Object.keys(simplifiedTestInfo);
        const columns = 2;
        const rows = Math.ceil(testInfoKeys.length / columns);

        // Calculate row height based on available space
        const rowHeight = 15;

        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < columns; j++) {
            const index = i * columns + j;
            if (index < testInfoKeys.length) {
              const key = testInfoKeys[index];
              const value = simplifiedTestInfo[key];

              // Calculate column width and position
              const colWidth = contentWidth / columns;
              const colX = 25 + (j * colWidth);

              // Draw cell with white background and black border
              doc.rect(colX, currentY, colWidth, rowHeight)
                .fillColor('#ffffff')
                .fill();

              doc.strokeColor('#000000')
                .lineWidth(0.5)
                .rect(colX, currentY, colWidth, rowHeight)
                .stroke();

              // Draw label with smaller font - vertically centered
              doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor('#333333')
                .text(key + ':', colX + 3, currentY + (rowHeight / 2) - 3, {
                  width: colWidth * 0.4 - 5,
                  height: rowHeight - 4,
                  ellipsis: true,
                  align: 'left'
                });

              // Draw value with smaller font and text truncation for long values - vertically centered
              doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#333333')
                .text(value, colX + 3 + (colWidth * 0.4), currentY + (rowHeight / 2) - 3, {
                  width: colWidth * 0.6 - 5,
                  height: rowHeight - 4,
                  ellipsis: true,
                  align: 'left'
                });
            }
          }
          currentY += rowHeight;
        }
      }

      currentY += 20;

      // NEW LAYOUT: "Test Result" header with underline
      doc.fontSize(12).font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Test Result', 25, currentY);

      // Add underline
      doc.moveTo(25, currentY + 16)
        .lineTo(pageWidth - 25, currentY + 16)
        .lineWidth(2)
        .stroke();

      currentY += 25;

      // Calculate dimensions for the two boxes (graph and calculated properties)
      const boxHeight = 300; // Fixed height for both boxes

      // Use the same ratio as the footer section (70% vs 30%)
      const leftBoxWidth = contentWidth * 0.7; // 70% for graph (same as Comments section)
      const rightBoxWidth = contentWidth * 0.3; // 30% for calculated properties (same as AMTEST UK section)

      // LEFT BOX - Graph
      doc.rect(25, currentY, leftBoxWidth, boxHeight)
        .strokeColor('#000000')
        .lineWidth(1)
        .stroke();

      // RIGHT BOX - Calculated Properties
      doc.rect(25 + leftBoxWidth, currentY, rightBoxWidth, boxHeight)
        .strokeColor('#000000')
        .lineWidth(1)
        .stroke();

      // Add graph to left box if available
      if (graphs && graphs.length > 0) {
        const graph = graphs[0]; // Use only the first graph

        // Calculate padding and dimensions to fit graph inside the box
        const graphPadding = 10;
        const graphWidth = leftBoxWidth - (graphPadding * 2);
        const graphHeight = boxHeight - (graphPadding * 2);

        // Draw graph
        doc.image(Buffer.from(graph.imageBase64, 'base64'), {
          fit: [graphWidth, graphHeight],
          align: 'center',
          valign: 'center',
          x: 25 + graphPadding,
          y: currentY + graphPadding
        });

        // Optional: Add graph title at the bottom of the box
        if (graph.title) {
          doc.fontSize(9).font('Helvetica')
            .fillColor('#000000')
            .text(graph.title,
              25, currentY + boxHeight - 20, {
              width: leftBoxWidth,
              align: 'center',
              ellipsis: true
            });
        }
      } else {
        // If no graph available, add text "Graph Data"
        doc.fontSize(16).font('Helvetica')
          .fillColor('#000000')
          .text('Graph Data',
            25, currentY + (boxHeight / 2) - 10, {
            width: leftBoxWidth,
            align: 'center'
          });
      }

      // Add "Results" header to right box
      doc.fontSize(12).font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Results',
          25 + leftBoxWidth, currentY + 10, {
          width: rightBoxWidth,
          align: 'center'
        });

      // Add calculated properties to right box in Excel-like table format
      if (Object.keys(simplifiedProperties).length > 0) {
        // Calculate table dimensions
        const tableStartY = currentY + 40;
        const tableWidth = rightBoxWidth - 20; // 10px padding on each side
        const tableX = 25 + leftBoxWidth + 10;

        // Limit to max 6 properties
        const propertyEntries = Object.entries(simplifiedProperties).slice(0, 6);
        const propertyCount = propertyEntries.length;
        
        // Increase minimum row height to prevent text overlap
        const minRowHeight = 25;
        const availableHeight = boxHeight - 50; // Account for header
        // Ensure rows are tall enough for text
        const rowHeight = Math.max(minRowHeight, Math.min(30, availableHeight / (propertyCount + 1)));

        // Draw table header row
        doc.rect(tableX, tableStartY, tableWidth, rowHeight)
          .fillColor('#e6e6e6') // Light gray background for header
          .fill();

        doc.strokeColor('#000000')
          .lineWidth(0.5)
          .rect(tableX, tableStartY, tableWidth, rowHeight)
          .stroke();

        // Draw header text (Property | Value)
        const colWidth = tableWidth / 2;

        // Property header
        doc.rect(tableX, tableStartY, colWidth, rowHeight)
          .strokeColor('#000000')
          .lineWidth(0.5)
          .stroke();

        doc.fontSize(8).font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Property',
            tableX + 5, tableStartY + (rowHeight / 2) - 4, {
            width: colWidth - 10,
            align: 'left'
          });

        // Value header
        doc.rect(tableX + colWidth, tableStartY, colWidth, rowHeight)
          .strokeColor('#000000')
          .lineWidth(0.5)
          .stroke();

        doc.fontSize(8).font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Value',
            tableX + colWidth + 5, tableStartY + (rowHeight / 2) - 4, {
            width: colWidth - 10,
            align: 'left'
          });

        // Draw data rows
        let rowY = tableStartY + rowHeight;
        propertyEntries.forEach(([key, value], index) => {
          // Skip if we're running out of space
          if (rowY > currentY + boxHeight - rowHeight) return;

          // Draw row background
          doc.rect(tableX, rowY, tableWidth, rowHeight)
            .fillColor('#ffffff')
            .fill();

          doc.strokeColor('#000000')
            .lineWidth(0.5)
            .rect(tableX, rowY, tableWidth, rowHeight)
            .stroke();

          // Property cell
          doc.rect(tableX, rowY, colWidth, rowHeight)
            .strokeColor('#000000')
            .lineWidth(0.5)
            .stroke();

          // Calculate text height to center vertically
          const textHeight = 7; // Font size
          const verticalPadding = (rowHeight - textHeight) / 2;

          // Draw property name with vertical centering
          doc.fontSize(7).font('Helvetica')
            .fillColor('#000000')
            .text(key,
              tableX + 5, rowY + verticalPadding, {
              width: colWidth - 10,
              height: rowHeight - (verticalPadding * 2),
              align: 'left'
            });

          // Value cell
          doc.rect(tableX + colWidth, rowY, colWidth, rowHeight)
            .strokeColor('#000000')
            .lineWidth(0.5)
            .stroke();

          // Draw value with vertical centering
          doc.fontSize(7).font('Helvetica')
            .fillColor('#000000')
            .text(value,
              tableX + colWidth + 5, rowY + verticalPadding, {
              width: colWidth - 10,
              height: rowHeight - (verticalPadding * 2),
              align: 'left'
            });

          rowY += rowHeight;
        });
      } else {
        // If no properties available, add placeholder text
        doc.fontSize(16).font('Helvetica')
          .fillColor('#000000')
          .text('Calculated\nproperties\npart',
            25 + leftBoxWidth, currentY + (boxHeight / 2) - 30, {
            width: rightBoxWidth,
            align: 'center',
            lineGap: 10
          });
      }

      currentY += boxHeight + 20;

      // FOOTER SECTION - Positioned at the bottom of the page
      // Calculate footer Y position to ensure it's at the bottom
      const footerY = pageHeight - 225 - 20; // 20px from bottom margin

      // Define the footer table structure
      const leftColWidth = contentWidth * 0.7;
      const rightColWidth = contentWidth * 0.3;

      // Comments header cell with gray background
      doc.rect(25, footerY, leftColWidth, 25)
        .fillColor('#e6e6e6')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25, footerY, leftColWidth, 25)
        .stroke();

      // For and on behalf of AMTEST UK header cell with gray background
      doc.rect(25 + leftColWidth, footerY, rightColWidth, 25)
        .fillColor('#e6e6e6')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY, rightColWidth, 25)
        .stroke();

      // Comments header text - with vertical centering
      doc.fontSize(8)
        .font('Helvetica')
        .fillColor('#000000')
        .text('Comments (e.g., any deviation from the standard test method, relevant information to the specific test)',
          30, footerY + 8, {
          width: leftColWidth - 15,
          ellipsis: false,
          lineBreak: true,
          height: 25,
          align: 'left'
        });


      // For and on behalf of AMTEST UK header text - with vertical centering
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('For and on behalf of AMTEST UK',
          30 + leftColWidth, footerY + 8, {
          width: rightColWidth - 10,
          align: 'center',
          ellipsis: true
        });

      // Comments content cell - large empty cell
      doc.rect(25, footerY + 25, leftColWidth, 75)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25, footerY + 25, leftColWidth, 75)
        .stroke();

      // Approved by row
      doc.rect(25 + leftColWidth, footerY + 25, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY + 25, rightColWidth / 2, 25)
        .stroke();

      doc.rect(25 + leftColWidth + rightColWidth / 2, footerY + 25, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth + rightColWidth / 2, footerY + 25, rightColWidth / 2, 25)
        .stroke();

      // Approved by text - with vertical centering
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Approved by:',
          30 + leftColWidth, footerY + 33, {
          width: rightColWidth / 2 - 10,
          ellipsis: true
        });

      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('R.Adams',
          30 + leftColWidth + rightColWidth / 2, footerY + 33, {
          width: rightColWidth / 2 - 10,
          align: 'center',
          ellipsis: true
        });

      // Position Held row
      doc.rect(25 + leftColWidth, footerY + 50, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY + 50, rightColWidth / 2, 25)
        .stroke();

      doc.rect(25 + leftColWidth + rightColWidth / 2, footerY + 50, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth + rightColWidth / 2, footerY + 50, rightColWidth / 2, 25)
        .stroke();

      // Position Held text - with vertical centering
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Position Held:',
          30 + leftColWidth, footerY + 58, {
          width: rightColWidth / 2 - 10,
          ellipsis: true
        });

      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Senior Technician',
          30 + leftColWidth + rightColWidth / 2, footerY + 58, {
          width: rightColWidth / 2 - 10,
          align: 'center',
          ellipsis: true
        });

      // Signature row
      doc.rect(25 + leftColWidth, footerY + 75, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY + 75, rightColWidth / 2, 25)
        .stroke();

      doc.rect(25 + leftColWidth + rightColWidth / 2, footerY + 75, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth + rightColWidth / 2, footerY + 75, rightColWidth / 2, 25)
        .stroke();

      // Signature text - with vertical centering
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Signature:',
          30 + leftColWidth, footerY + 83, {
          width: rightColWidth / 2 - 10,
          ellipsis: true
        });

      // No signature as requested

      // Remarks header
      doc.rect(25, footerY + 100, leftColWidth, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25, footerY + 100, leftColWidth, 25)
        .stroke();

      // Remarks header text - with vertical centering
      doc.fontSize(9).font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Remarks', 30, footerY + 108);

      // Date Reported row
      doc.rect(25 + leftColWidth, footerY + 100, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY + 100, rightColWidth / 2, 25)
        .stroke();

      doc.rect(25 + leftColWidth + rightColWidth / 2, footerY + 100, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth + rightColWidth / 2, footerY + 100, rightColWidth / 2, 25)
        .stroke();

      // Date Reported text - with vertical centering
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Date Reported:',
          30 + leftColWidth, footerY + 108, {
          width: rightColWidth / 2 - 10,
          ellipsis: true
        });

      // Use fixed date "10.03.2025" as shown in the example
      const reportDate = "10.03.2025";

      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text(reportDate,
          30 + leftColWidth + rightColWidth / 2, footerY + 108, {
          width: rightColWidth / 2 - 10,
          align: 'center',
          ellipsis: true
        });

      // Remark 1 row
      doc.rect(25, footerY + 125, leftColWidth, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25, footerY + 125, leftColWidth, 25)
        .stroke();

      // Report Issue No row
      doc.rect(25 + leftColWidth, footerY + 125, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY + 125, rightColWidth / 2, 25)
        .stroke();

      doc.rect(25 + leftColWidth + rightColWidth / 2, footerY + 125, rightColWidth / 2, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth + rightColWidth / 2, footerY + 125, rightColWidth / 2, 25)
        .stroke();

      // Report Issue No text - with vertical centering
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Report Issue No:',
          30 + leftColWidth, footerY + 133, {
          width: rightColWidth / 2 - 10,
          ellipsis: true
        });

      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('001',
          30 + leftColWidth + rightColWidth / 2, footerY + 133, {
          width: rightColWidth / 2 - 10,
          align: 'center',
          ellipsis: true
        });

      // Draw a circle for bullet point 1
      doc.circle(35, footerY + 137, 5)
        .stroke();

      // Add number 1 inside the circle
      doc.fontSize(8).font('Helvetica')
        .fillColor('#000000')
        .text('1', 32, footerY + 134);

      // Remark 1 text - with vertical centering
      doc.fontSize(8)
        .font('Helvetica')
        .fillColor('#000000')
        .text('Test results reported only relate to the item(s) tested and apply to the sample as received.',
          45, footerY + 133, {
          width: leftColWidth - 50,
          ellipsis: false,
          lineBreak: true,
          height: 25
        });

      // Remark 2 row
      doc.rect(25, footerY + 150, leftColWidth, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25, footerY + 150, leftColWidth, 25)
        .stroke();

      // Company address row
      doc.rect(25 + leftColWidth, footerY + 150, rightColWidth, 25)
        .fillColor('#ffffff')
        .fill();

      doc.strokeColor('#000000')
        .lineWidth(0.5)
        .rect(25 + leftColWidth, footerY + 150, rightColWidth, 25)
        .stroke();

      // Draw a circle for bullet point 2
      doc.circle(35, footerY + 162, 5)
        .stroke();

      // Add number 2 inside the circle
      doc.fontSize(8).font('Helvetica')
        .fillColor('#000000')
        .text('2', 32, footerY + 159);

      // Remark 2 text - with vertical centering
      doc.fontSize(8)
        .font('Helvetica')
        .fillColor('#000000')
        .text('This report shall not be reproduced, except in full, without approval of the Laboratory.',
          45, footerY + 158, {
          width: leftColWidth - 50,
          ellipsis: false,
          lineBreak: true,
          height: 25
        });

      // Company address text - with vertical centering
      doc.fontSize(7)
        .font('Helvetica')
        .fillColor('#000000')
        .text('AMTEST UK LTD Unit A 2D/6 Project Park, North Crescent, Canning Town E16 4TQ',
          30 + leftColWidth, footerY + 155, {
          width: rightColWidth - 15,
          ellipsis: false,
          lineBreak: true,
          height: 25
        });

      // Finalize PDF
      doc.end();

      stream.on('finish', () => {
        const pdfBase64 = fs.readFileSync(pdfPath, { encoding: 'base64' });
        resolve({ pdfPath, pdfBase64 });
      });

      stream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}


// Image parser endpoint (modified to generate PDF with graphs)
app.post('/api/imageparser', async (req, res) => {
  try {
    const { excelFile, htmlContent } = req.body;

    // Use Claude to analyze the data and extract structured information
    const analysisResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 20000,
      temperature: 0.2,
      system: `You are a materials science expert specializing in analyzing test data. Your task is to analyze the provided HTML table data from a materials test and extract structured information.

Return a JSON object with the following structure:
{
  "testInfo": {
    // Include ALL test information fields found in the data
    // Format keys in camelCase (e.g., "testType", "sampleId")
    // IMPORTANT: All values MUST be simple strings or numbers, NOT objects or arrays
  },
  "analyzedData": {
    // Raw data points extracted from the HTML table
    // IMPORTANT: All values MUST be simple strings or numbers, NOT objects or arrays
  },
  "calculatedProperties": {
    // IMPORTANT: Include only the 6 MOST IMPORTANT properties
    // Format keys in camelCase (e.g., "youngModulus", "tensileStrength")
    // IMPORTANT: All values MUST be simple strings or numbers, NOT objects or arrays
    // For example: "youngModulus": "210.5 GPa" (not an object or array)
    // If a value would normally be complex, convert it to a simple string representation
  },
  "graphData": [
    // Array of graph specifications - include ALL relevant graphs
    {
      "title": "Graph title (e.g., 'Stress-Strain Curve')",
      "type": "line", // Chart type: line, bar, scatter, etc.
      "xAxisLabel": "X-axis label (e.g., 'Strain (%)')",
      "yAxisLabel": "Y-axis label (e.g., 'Stress (MPa)')",
      "beginAtZero": true/false,
      "labels": ["x1", "x2", "x3", ...], // X-axis data points
      "datasets": [
        {
          "label": "Dataset label",
          "data": [y1, y2, y3, ...], // Y-axis data points
          "borderColor": "rgba(54, 162, 235, 1)",
          "backgroundColor": "rgba(54, 162, 235, 0.2)"
        }
      ]
    }
  ],
  "analysis": "Very brief analysis of the test results (50-100 words maximum)"
}

Make sure to:
1. Extract ALL test information fields found in the data
2. ALL values in testInfo and calculatedProperties MUST be simple strings or numbers, NOT objects or arrays
3. Include ONLY the 6 MOST IMPORTANT calculated properties
4. Include ALL relevant graphs that would visualize the test results
5. Keep the analysis very brief to fit on a single-page report

IMPORTANT: DO NOT return complex objects or arrays as values in testInfo or calculatedProperties. Convert any complex values to simple string representations.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please analyze this material test data and extract structured information: ${htmlContent}`
            }
          ]
        }
      ]
    });

    // Extract JSON from Claude's response
    let reportData;
    try {
      const jsonMatch = analysisResponse.content[0].text.match(/```json\n([\s\S]*?)\n```/) ||
        analysisResponse.content[0].text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        reportData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        throw new Error("Could not extract JSON from Claude's response");
      }
    } catch (parseError) {
      console.error("Error parsing Claude's response:", parseError);
      throw new Error("Failed to parse analysis results");
    }

    // Generate graphs from the extracted data
    const graphs = await generateGraphs(reportData.graphData || []);

    // Create PDF with the report data and graphs
    const { pdfBase64 } = await createPDF(reportData, graphs);

    // Send response with PDF and report data
    res.json({
      msg: analysisResponse.content,
      pdfBase64: pdfBase64,
      reportData: reportData
    });

  } catch (error) {
    console.log(error);
    res.status(400).json({ error: error.message });
  }
});



// Excel Analysis endpoint
app.post('/api/excelAnalysis', async (req, res) => {
  try {
    const { excelFile, filename, sheetName } = req.body;

    const msg = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1000,
      temperature: 1,
      system: "Analyze that htmlContent script and make the data into JSON Format. With this Material Test data, I need to write Test Report. I need to make it as excel grid format in html. Please give me whole code of html of this test report. Not only the data in the content file, but also the values that extracted from the data in the content file using the formulation calculations.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze that htmlContent script and make the data into JSON Format. With this Material Test data, I need to write Test Report. I need to make it as excel grid format in html. Please give me whole code of html of this test report. Not only the data in the content file, but also the values that extracted from the data in the content file using the formulation calculations." + htmlContent
            }
          ]
        }
      ]
    });
    console.log("msg:::: ", msg);

    // Send response
    res.json({ msg: msg.content });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: error.message });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user from Supabase
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('email', email)
      .single();

    if (error || !data) {
      throw new Error('User not found');
    }

    // Check password
    const validPassword = await bcrypt.compare(password, data.password);
    if (!validPassword) {
      throw new Error('Invalid password');
    }

    // Create JWT token
    const token = jwt.sign({ userId: data.id }, process.env.JWT_SECRET);

    res.json({ token, user: { id: data.id, email: data.email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Clean up temp files periodically
setInterval(() => {
  fs.readdir(tempDir, (err, files) => {
    if (err) return;

    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;

        // Delete files older than 1 hour
        if (now - stats.mtime.getTime() > 3600000) {
          fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting file ${filePath}:`, err);
          });
        }
      });
    });
  });
}, 3600000); // Run every hour

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
