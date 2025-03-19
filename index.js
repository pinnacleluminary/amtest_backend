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
const { registerFont } = require('canvas');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Define font paths
const fontPath = path.join(__dirname, './assets/Helvetica.ttf');
const fontBoldPath = path.join(__dirname, './assets/Helvetica-Bold.ttf');

// Register fonts for canvas (used by Chart.js)
try {
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: 'Helvetica', weight: 'normal' });
    console.log('Successfully registered Helvetica font for charts');
  } else {
    console.warn('Warning: Helvetica.ttf not found at:', fontPath);
  }

  if (fs.existsSync(fontBoldPath)) {
    registerFont(fontBoldPath, { family: 'Helvetica', weight: 'bold' });
    console.log('Successfully registered Helvetica-Bold font for charts');
  } else {
    console.warn('Warning: Helvetica-Bold.ttf not found at:', fontBoldPath);
  }
} catch (fontError) {
  console.error('Error registering fonts for charts:', fontError);
}

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

// Function to generate graphs using Chart.js with Helvetica font
async function generateGraphs(graphData) {
  try {
    const width = 800;
    const height = 400;
    const backgroundColour = 'white';
    
    // Create a chart callback that uses the registered Helvetica font
    const chartCallback = (ChartJS) => {
      // Check if Helvetica was successfully registered
      const fontFamily = fs.existsSync(fontPath) ? 'Helvetica' : 'Arial, Helvetica, sans-serif';
      
      // Apply the font configuration globally
      ChartJS.defaults.font = {
        family: fontFamily,
        size: 12,
        weight: 'normal',
        lineHeight: 1.2
      };
      
      ChartJS.defaults.color = '#333';
      
      // Register a plugin to ensure consistent font rendering
      ChartJS.register({
        id: 'fontHandler',
        beforeDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.textBaseline = 'middle';
          ctx.font = `${ChartJS.defaults.font.size}px ${fontFamily}`;
        }
      });
    };
    
    // Create chart with Helvetica font handling
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width, 
      height, 
      backgroundColour,
      chartCallback: chartCallback
    });

    const graphs = [];

    for (const graph of graphData) {
      // Determine which font to use
      const fontFamily = fs.existsSync(fontPath) ? 'Helvetica' : 'Arial, Helvetica, sans-serif';
      
      // Set chart type based on test type if not specified
      let chartType = graph.type || 'line';
      
      // Special handling for specific test types
      if (graph.title && graph.title.toLowerCase().includes('particle size distribution')) {
        chartType = 'line';
      } else if (graph.title && graph.title.toLowerCase().includes('constituents')) {
        chartType = 'pie';
      } else if (graph.title && (
        graph.title.toLowerCase().includes('strength') || 
        graph.title.toLowerCase().includes('comparison')
      )) {
        chartType = 'bar';
      }
      
      // Generate chart configuration with Helvetica font
      const configuration = {
        type: chartType,
        data: {
          labels: graph.labels,
          datasets: graph.datasets.map(dataset => {
            // Base dataset configuration
            const datasetConfig = {
              label: dataset.label,
              data: dataset.data,
              borderWidth: dataset.borderWidth || 1,
              fill: dataset.fill !== undefined ? dataset.fill : false
            };
            
            // Add type-specific styling
            if (chartType === 'line') {
              datasetConfig.backgroundColor = dataset.backgroundColor || 'rgba(54, 162, 235, 0.2)';
              datasetConfig.borderColor = dataset.borderColor || 'rgba(54, 162, 235, 1)';
              datasetConfig.pointBackgroundColor = dataset.pointBackgroundColor || 'rgba(54, 162, 235, 1)';
              datasetConfig.pointBorderColor = dataset.pointBorderColor || '#fff';
              datasetConfig.pointRadius = dataset.pointRadius || 4;
              datasetConfig.tension = 0.4;
            } else if (chartType === 'bar') {
              datasetConfig.backgroundColor = dataset.backgroundColor || 'rgba(54, 162, 235, 0.7)';
              datasetConfig.borderColor = dataset.borderColor || 'rgba(54, 162, 235, 1)';
              datasetConfig.borderWidth = dataset.borderWidth || 1;
            } else if (chartType === 'pie') {
              // For pie charts, we need an array of colors
              const defaultColors = [
                'rgba(54, 162, 235, 0.7)',
                'rgba(255, 99, 132, 0.7)',
                'rgba(255, 206, 86, 0.7)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(153, 102, 255, 0.7)',
                'rgba(255, 159, 64, 0.7)',
                'rgba(199, 199, 199, 0.7)',
                'rgba(83, 102, 255, 0.7)',
                'rgba(40, 159, 64, 0.7)',
                'rgba(210, 199, 199, 0.7)'
              ];
              
              datasetConfig.backgroundColor = dataset.backgroundColor || defaultColors;
              datasetConfig.borderColor = dataset.borderColor || '#fff';
              datasetConfig.borderWidth = dataset.borderWidth || 1;
            } else if (chartType === 'scatter') {
              datasetConfig.backgroundColor = dataset.backgroundColor || 'rgba(54, 162, 235, 0.7)';
              datasetConfig.borderColor = dataset.borderColor || 'rgba(54, 162, 235, 1)';
              datasetConfig.pointRadius = dataset.pointRadius || 5;
            }
            
            return datasetConfig;
          })
        },
        options: {
          responsive: true,
          animation: false, // Disable animations for server-side rendering
          plugins: {
            title: {
              display: true,
              text: graph.title || 'Chart',
              font: {
                size: 16,
                weight: 'bold',
                family: fontFamily // Use Helvetica
              },
              padding: 20,
              color: '#333'
            },
            legend: {
              display: true,
              position: 'top',
              labels: {
                boxWidth: 40,
                padding: 10,
                font: {
                  size: 12,
                  family: fontFamily // Use Helvetica
                },
                color: '#333'
              }
            },
            tooltip: {
              enabled: false // Disable tooltips for server-side rendering
            },
            datalabels: {
              display: false // Disable data labels by default
            }
          },
          scales: chartType !== 'pie' ? {
            x: {
              title: {
                display: true,
                text: graph.xAxisLabel || '',
                font: {
                  size: 14,
                  weight: 'bold',
                  family: fontFamily // Use Helvetica
                },
                padding: {top: 10, bottom: 10},
                color: '#333'
              },
              ticks: {
                font: {
                  size: 12,
                  family: fontFamily // Use Helvetica
                },
                padding: 8,
                color: '#333',
                maxRotation: 45,
                minRotation: 0
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.1)'
              }
            },
            y: {
              title: {
                display: true,
                text: graph.yAxisLabel || '',
                font: {
                  size: 14,
                  weight: 'bold',
                  family: fontFamily // Use Helvetica
                },
                padding: {top: 10, bottom: 10},
                color: '#333'
              },
              ticks: {
                font: {
                  size: 12,
                  family: fontFamily // Use Helvetica
                },
                padding: 8,
                color: '#333'
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.1)'
              },
              beginAtZero: graph.beginAtZero !== undefined ? graph.beginAtZero : true
            }
          } : {}, // No scales for pie charts
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
              tension: 0.4
            },
            point: {
              radius: 4,
              hoverRadius: 6
            }
          }
        }
      };

      try {
        // Add additional error handling and timeout
        const renderPromise = chartJSNodeCanvas.renderToBuffer(configuration);
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Chart rendering timed out')), 15000);
        });
        
        const imageBuffer = await Promise.race([renderPromise, timeoutPromise]);
        const imageBase64 = imageBuffer.toString('base64');

        graphs.push({
          title: graph.title || 'Chart',
          imageBase64: imageBase64
        });
      } catch (renderError) {
        console.error('Error rendering chart:', renderError);
        
        // Create a simpler fallback chart with minimal text
        const fallbackCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour });
        const fallbackConfig = {
          type: 'bar',
          data: {
            labels: ['Error'],
            datasets: [{
              label: 'Chart rendering failed',
              data: [1],
              backgroundColor: 'rgba(255, 0, 0, 0.2)',
              borderColor: 'rgba(255, 0, 0, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Chart Rendering Error',
                font: {
                  size: 16,
                  weight: 'bold',
                  family: 'Arial, Helvetica, sans-serif' // Fallback font for error chart
                }
              }
            }
          }
        };
        
        try {
          const fallbackBuffer = await fallbackCanvas.renderToBuffer(fallbackConfig);
          const fallbackBase64 = fallbackBuffer.toString('base64');
          
          graphs.push({
            title: 'Chart Rendering Error',
            imageBase64: fallbackBase64
          });
        } catch (fallbackError) {
          console.error('Fallback chart also failed:', fallbackError);
          // Return a static error image or placeholder
          graphs.push({
            title: 'Chart Error',
            imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5fY51AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4QQQEwksSS9ZWwAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAC2klEQVR42u3csU0DMQBAERNCSAhEQTQIKVBX0qCgQFYgKZgVIBQEaYDYQB3ERYfkFpz8oPiRvuf10jV3DgsUcpRzzgGAjG4BQGABEFgABBYAgQVAYAEQWAAEFgCBBUBgARBYAAQWAIEFQGABEFgABBYAgQVAYAEQWAAEFgCBBUBgARBYAAQWAIEFQGABEFgABBYAgQVAYAEQWAAEFgCBBUBgARBYAAQWAIEFQGABEFgABBYAgQVAYAEQWAAEFgCBBUBgAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMmV8CHarSJXohbmwAAAAASUVORK5CYII='
          });
        }
      }
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
      const contentWidth = pageWidth - 50;
      const pageHeight = doc.page.height;

      // HEADER SECTION
      const topPadding = 15;
      let currentY = 20 + topPadding;

      // Add logo
      const logoPath = path.join(__dirname, './assets/logo.png');
      doc.image(logoPath, 25, currentY, {
        width: 80,
        height: 30
      });

      // Get title from test data
      const testTitle = reportData.testInfo?.testType || 'Material Test Report';
      const centerX = pageWidth / 2;

      // Report title - centered and bold
      doc.fontSize(12).font('Helvetica-Bold')
        .fillColor('#333333')
        .text(testTitle, centerX - 150, currentY, {
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
        .text(currentDate, pageWidth - 100, currentY, {
          align: 'right'
        });

      currentY = 75;

      // Format property name from camelCase to title case
      const formatPropertyName = (key) => {
        return key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Simplify values for display
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

      // Simplify all test info
      const simplifiedTestInfo = {};
      if (reportData.testInfo) {
        Object.entries(reportData.testInfo).forEach(([key, value]) => {
          // Skip arrays since we don't want to display them
          if (!Array.isArray(value)) {
            simplifiedTestInfo[formatPropertyName(key)] = simplifyValue(value);
          }
        });
      }

      // Simplify all calculated properties
      const simplifiedProperties = {};
      
      if (reportData.calculatedProperties) {
        Object.entries(reportData.calculatedProperties).forEach(([key, value]) => {
          // Skip arrays since we don't want to display them
          if (!Array.isArray(value)) {
            simplifiedProperties[formatPropertyName(key)] = simplifyValue(value);
          }
        });
      }

      // TEST INFORMATION TABLE
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

              // Draw value with smaller font
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

      // TEST RESULT SECTION
      doc.fontSize(12).font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Test Result', 25, currentY);

      // Add underline
      doc.moveTo(25, currentY + 16)
        .lineTo(pageWidth - 25, currentY + 16)
        .lineWidth(2)
        .stroke();

      currentY += 25;

      // Calculate dimensions for the boxes - always use 70/30 split
      const boxHeight = 300;
      const leftBoxWidth = contentWidth * 0.7;
      const rightBoxWidth = contentWidth * 0.3;

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
        const graph = graphs[0];

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
        const tableStartY = currentY + 40;
        const tableWidth = rightBoxWidth - 20;
        const tableX = 25 + leftBoxWidth + 10;

        // Limit to max 6 properties
        const propertyEntries = Object.entries(simplifiedProperties).slice(0, 6);
        const propertyCount = propertyEntries.length;

        const minRowHeight = 25;
        const availableHeight = boxHeight - 50;
        const rowHeight = Math.max(minRowHeight, Math.min(30, availableHeight / (propertyCount + 1)));

        // Draw table header row
        doc.rect(tableX, tableStartY, tableWidth, rowHeight)
          .fillColor('#e6e6e6')
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

          const textHeight = 7;
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
        // If no properties available
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
      const footerY = pageHeight - 225 - 20;

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

      // Add analysis text if available
      if (reportData.analysis) {
        doc.fontSize(8).font('Helvetica')
          .fillColor('#000000')
          .text(reportData.analysis,
            30, footerY + 30, {
            width: leftColWidth - 10,
            align: 'left'
          });
      }

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

      const reportDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '.');

      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text(reportDate,
          30 + leftColWidth + rightColWidth / 2, footerY + 108, {
          width: rightColWidth / 2 - 10,
          align: 'center',
          ellipsis: true
        });

      // Remark 1 row (continued)
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
    // EXCEPTION: If the data contains a table of values that should be displayed as a table in the report,
    // you may include it as an array with key name ending with "Table" or "Data" (e.g., "testResultsTable")
  },
  "analyzedData": {
    // Raw data points extracted from the HTML table
    // IMPORTANT: All values MUST be simple strings or numbers, NOT objects or arrays
    // EXCEPTION: If the data contains a table of values that should be displayed as a table in the report,
    // you may include it as an array with key name ending with "Table" or "Data" (e.g., "testResultsTable")
  },
  "calculatedProperties": {
    // IMPORTANT: Include only the 6 MOST IMPORTANT properties
    // Format keys in camelCase (e.g., "youngModulus", "tensileStrength")
    // IMPORTANT: All values MUST be simple strings or numbers, NOT objects or arrays
    // For example: "youngModulus": "210.5 GPa" (not an object or array)
    // If a value would normally be complex, convert it to a simple string representation
    // EXCEPTION: If the test type requires displaying tabular data (like particle size distribution),
    // you may include an array with appropriate name (e.g., "particleSizeData", "testResults")
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
  "analysis": "Brief analysis of the test results (50-100 words maximum)"
}

IMPORTANT INSTRUCTIONS FOR SPECIFIC TEST TYPES: (Sample Fields of Calculated Properties: So please generate the calculated Properties fields according to the test type like in the below conditions.)

- Determination of water content - soils
Water Content (%)
Material Description: 
Lower Limit: 
Upper Limit: 

- Particle size distribution : Soils
Sieve Size, Passing (Array)

- Determination of particle density - gas jar method
Particle Density(Mg/m3):
Material Description:

- Liquid and plastic limits: soils
Water Contnt as Received (W)(%)
Corrected Liquid Limit (WL)(%)
Liquid Limit (%)
Plastic Limit (WP)(%)
Plasticity Index (IP)(%)
Liquid Limit Index (IL) (%)
Consistency Index (IC) (%)
%Passing 425um BS Test Sieve (%)
Cone Used (g/deg)
Correlation Factor

Test Reading
Avg. Penetration
Water Content

- Rammer/Hammer Maximum Dry Density/Water Content Relationship
Grading Zone
Maximum Dry Density
Optimum Water Content
Dry Mass retained on 20 mm Test Sieve
Dry Mass retained on 37.5 mm Test
Measured Particle Density
Assumed Particle Density

Array of (Compaction Point No., Water Content %, Dry Density(Mg/m3))

- Moisture Condition Value
Moisture Condition Value
Natural Water Content (%)
Percentage Retained on 20mm Sieve (%)
Interpretation of Curve
Preparation Method

- Water Content Relation
Array (Test No, MCV, Water Content)
Percentage Retained on 20mm Sieve (%)

- Determination of california Bearing ratio
Test Result-Top (Load on Plunger @ 2.5mm Penetration, CBR Value @ 2.5mm Penetration, Load on Plunger @ 5.0 mm Penetration, CBR Value @ 5.0mm Penetration, Top Part Water Content
CBR Value for Top Part)

Test Result-Base (Load on Plunger @ 2.5mm Penetration, CBR Value @ 2.5mm Penetration, Load on Plunger @ 5.0 mm Penetration, CBR Value @ 5.0mm Penetration, Top Part Water Content
CBR Value for Top Part)

- Determination of Water Content of Aggregates
Water Content (%)
Material Description
Lower Limit
Upper Limit

- Determination of Geometrical Properties of Aggregates (Constituent Classification)
Test Drying Temperature
Floating Particles
Cohesive, Gypsum, Floating Wood, Plastic & Rubber
Concrete: Concrete Products, Mortar & Concrete, Masonry Units
Unbound Aggregate: Natural Stone, & Hydraulically Bound Aggregate
Clay Masonry Units: Calcium Silicate Masonry Units, Aerated non-Floating Concrete
Bituminous Materials
Glass

- Determinatin of In-Situ Shear Value - Hand Shear Vane Method
The same data as the test data

- Aggregate Particles between X mm and Y mm
Mass of Dry Sample Tested
Particle Density (prd)
Particle Density(pssd)
Apparent Particle Density (Pa)
Water Absorption (Wa)

- Los Angeles Abrasion - Standard Method
The Los Angeles Coefficient (LA)
Upper Aggregate Size (mm)
Lower Aggregate Size (mm)

- Concrete Core Compressive Strength
Date Tested
Age at Test
Diameter/Length Ratio oof Prepared Core
Surface Moisture Condition at Test
Density (kg/m3)
Failure Type
Core Compressive Strength (to nearest 0.1 MPa(N/mm2))
Any deviations from the standard of examination or compression testing
Tested By

- Concrete Cube Compressive Strenth
The same data as the test specimen details

- Determination of Chloride Migration Coefficient
Comparison of Specimens of the following fields
1. Measured Specimen Thichness (mm)
2. Measured Chloride Pnetration (mm)
3. Mean Chloride Migration Coefficient
4. Variation of Chloride Migration Coefficient
Comments on Testing

- Plate Bearing Load Test (CBR)
Maximum Applied Pressure
Maximum Deformation
Pressure at 1.25mm Settlement
K Value
Modulus of Subgrade Reaction
Corrected Modulus of Subgrade Reaction:
Approximate CBR value (%)

- Estimation of CBR by Dynamic Cone Penetrometer Method
Depth from (mm)
Depth to (mm)
No. of Blows
Blow Rate (mm/Blow)
Estimated CBR (%)

- Concrete Pour Record - Slump Test / Flow Table Test, Air Content & Density
The same data as the test data


NOTE: IT IS VERY IMPORTANT: We should check the test title carefully and please choose the correct instruction and generate the correct test result. And please avoid generating the same test data except for the conditions in the instructions.

Make sure to:
1. Extract ALL test information fields found in the data
2. ALL values in testInfo and calculatedProperties MUST be simple strings or numbers, NOT objects or arrays
   EXCEPTION: You may include array data for tables that should be displayed in the report
3. Include ONLY the 6 MOST IMPORTANT calculated properties
4. Include ALL relevant graphs that would visualize the test results
5. Keep the analysis very brief to fit on a single-page report`,
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

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).send('OK');
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
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
