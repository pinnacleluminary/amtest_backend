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
  } else {
    console.warn('Warning: Helvetica.ttf not found at:', fontPath);
  }

  if (fs.existsSync(fontBoldPath)) {
    registerFont(fontBoldPath, { family: 'Helvetica', weight: 'bold' });
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
                padding: { top: 10, bottom: 10 },
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
                padding: { top: 10, bottom: 10 },
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
      const doc = new PDFDocument({
        margins: { top: 20, bottom: 20, left: 25, right: 25 },
        size: 'A4',
        bufferPages: true
      });
      doc.registerFont('Helvetica', fontPath);
      doc.registerFont('Helvetica-Bold', fontBoldPath);
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 50;
      const pageHeight = doc.page.height;
      let currentY = 20;
      const testTitle = reportData.testInfo?.testType || reportData.testInfo?.testTitle || 'Material Test Report';
      const testSubtitle = reportData.testInfo?.testSubtype || '';
      const companyInfoWidth = 180;
      const logoWidth = companyInfoWidth;
      const logoHeight = 60;
      const logoX = pageWidth - logoWidth - 25;
      const logoY = currentY;
      const logoPath = path.join(__dirname, './assets/logo.png');
      doc.image(logoPath, logoX, logoY, { width: logoWidth, height: logoHeight });
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Test Report:', 25, currentY);
      currentY += 20;
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#3498db').text(testTitle + (testSubtitle ? ': ' + testSubtitle : ''), 25, currentY, { width: pageWidth - logoWidth - 50, align: 'left' });
      const titleHeight = doc.heightOfString(testTitle + (testSubtitle ? ': ' + testSubtitle : ''), { width: pageWidth - logoWidth - 50, align: 'left' });
      const addressY = logoY + logoHeight + 5;
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text('Amtest UK, Unit A 2D/6, Project Park,', logoX, addressY, { width: companyInfoWidth, align: 'left' });
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text('North Crescent, London E16 4TQ', logoX, addressY + 12, { width: companyInfoWidth, align: 'left' });
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text('Tel: 020 8090 1199', logoX, addressY + 24, { width: companyInfoWidth, align: 'left' });
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text('Email: enquiries@amtest.uk', logoX, addressY + 36, { width: companyInfoWidth, align: 'left' });
      const reportNo = reportData.testInfo?.issueNumber || 'INTLTP-10';
      const reportIssueNo = reportData.testInfo?.revisionNumber || '01';
      const reportInfoY = addressY + 48;
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text(`No.: ${reportNo} | Issue No.: ${reportIssueNo}`, logoX, reportInfoY, { width: companyInfoWidth, align: 'left' });
      currentY = Math.max(currentY + titleHeight + 20, reportInfoY + 20);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#3498db').text('Project Details', 25, currentY);
      currentY += 20;
      const formatPropertyName = (key) => {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace(/\s+/g, ' ').trim();
      };
      const projectDetailsFields = [];
      if (reportData.testInfo) {
        Object.entries(reportData.testInfo).forEach(([key, value]) => {
          if (key !== 'testType' && key !== 'testTitle') {
            const formattedKey = formatPropertyName(key) + ':';
            const formattedValue = value !== null && value !== undefined ? String(value) : '-';
            projectDetailsFields.push({ key: formattedKey, value: formattedValue });
          }
        });
      }
      const colWidth = contentWidth / 3;
      const fieldVerticalSpacing = 12;
      const maxLabelWidth = 80;
      const renderField = (field, x, y) => {
        const labelOptions = { width: maxLabelWidth, align: 'left' };
        const valueOptions = { width: colWidth - maxLabelWidth - 10, align: 'left' };
        const labelHeight = doc.heightOfString(field.key, labelOptions);
        const valueHeight = doc.heightOfString(field.value, valueOptions);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(field.key, x, y, labelOptions);
        doc.fontSize(9).font('Helvetica').fillColor('#000000').text(field.value, x + maxLabelWidth + 5, y, valueOptions);
        return Math.max(labelHeight, valueHeight);
      };
      const colYPositions = [currentY, currentY, currentY];
      projectDetailsFields.forEach(field => {
        const minColIndex = colYPositions.indexOf(Math.min(...colYPositions));
        const fieldX = 25 + (minColIndex * colWidth);
        const fieldY = colYPositions[minColIndex];
        const fieldHeight = renderField(field, fieldX, fieldY);
        colYPositions[minColIndex] += fieldHeight + fieldVerticalSpacing;
      });
      currentY = Math.max(...colYPositions) + 10;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#3498db').text('Test Results', 25, currentY);
      currentY += 20;
      const leftColWidth = contentWidth * 0.4;
      const rightColWidth = contentWidth * 0.6;
      const calculatedProperties = reportData.calculatedProperties || {};
      const propertyEntries = Object.entries(calculatedProperties);
      const availableHeight = pageHeight - currentY - 180;
      const testResultsHeight = Math.min(availableHeight, Math.max(propertyEntries.length * 20, 200));
      let testResultsStartY = currentY;
      let testResultsCurrentY = testResultsStartY;
      if (propertyEntries.length === 0) {
        const placeholderResults = [
          { key: 'Depth From:', value: '0 mm' },
          { key: 'Depth To:', value: '630 mm' },
          { key: 'Total Blows:', value: '36' },
          { key: 'Average Blow Rate:', value: '13.2 mm/blow' },
          { key: 'Estimated Cbr Range:', value: '8-15%' },
          { key: 'Material Strength:', value: 'Medium to Stiff' }
        ];
        placeholderResults.forEach((result) => {
          const labelOptions = { width: 120, align: 'left' };
          const valueOptions = { width: leftColWidth - 120 - 10, align: 'left' };
          const labelHeight = doc.heightOfString(result.key, labelOptions);
          const valueHeight = doc.heightOfString(result.value, valueOptions);
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(result.key, 25, testResultsCurrentY, labelOptions);
          doc.fontSize(9).font('Helvetica').fillColor('#000000').text(result.value, 25 + 120, testResultsCurrentY, valueOptions);
          const fieldHeight = Math.max(labelHeight, valueHeight);
          testResultsCurrentY += fieldHeight + fieldVerticalSpacing;
        });
      } else {
        propertyEntries.forEach(([key, value]) => {
          if (testResultsCurrentY > testResultsStartY + testResultsHeight - 20) return;
          const formattedKey = formatPropertyName(key) + ':';
          const labelOptions = { width: 120, align: 'left' };
          const valueOptions = { width: leftColWidth - 120 - 10, align: 'left' };
          const labelHeight = doc.heightOfString(formattedKey, labelOptions);
          const valueHeight = doc.heightOfString(value, valueOptions);
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(formattedKey, 25, testResultsCurrentY, labelOptions);
          doc.fontSize(9).font('Helvetica').fillColor('#000000').text(value, 25 + 120, testResultsCurrentY, valueOptions);
          const fieldHeight = Math.max(labelHeight, valueHeight);
          testResultsCurrentY += fieldHeight + fieldVerticalSpacing;
        });
      }
      if (graphs && graphs.length > 0) {
        const graph = graphs[0];
        const graphPadding = 10;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text('GRAPH DATA', 25 + leftColWidth, testResultsStartY, { width: rightColWidth, align: 'center' });
        const graphWidth = rightColWidth - (graphPadding * 2);
        const graphHeight = testResultsHeight - 20;
        doc.image(Buffer.from(graph.imageBase64, 'base64'), { fit: [graphWidth, graphHeight], align: 'center', valign: 'center', x: 25 + leftColWidth + graphPadding, y: testResultsStartY + 20 + graphPadding });
      }
      currentY = Math.max(testResultsCurrentY, testResultsStartY + testResultsHeight + 10);
      const complianceWidth = contentWidth * 0.5;
      const remarksWidth = contentWidth * 0.5;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#3498db').text('Compliance Standard', 25, currentY);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#3498db').text('Remarks', 25 + complianceWidth + 10, currentY);
      currentY += 20;
      const complianceText = reportData.complianceStandard || 'Certified that testing was carried out in accordance with:\nBS 1377-2:2022';
      const complianceHeight = 80;
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text(complianceText, 25, currentY, { width: complianceWidth - 10, align: 'left' });
      if (reportData.additionalStandards) {
        doc.fontSize(9).font('Helvetica').fillColor('#000000').text(reportData.additionalStandards, 25, currentY + 30, { width: complianceWidth - 10, align: 'left' });
      }
      doc.rect(25 + complianceWidth + 10, currentY, remarksWidth - 10, complianceHeight).strokeColor('#3498db').lineWidth(1).stroke();
      if (reportData.remarks) {
        doc.fontSize(9).font('Helvetica').fillColor('#000000').text(reportData.remarks, 25 + complianceWidth + 15, currentY + 10, { width: remarksWidth - 20, align: 'left' });
      }
      currentY += complianceHeight + 10;
      const signatureRowHeight = 20;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text('Approved Signatory:', 25, currentY);
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text(reportData.approvedSignatory || 'Dave Macken', 120, currentY);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text('Position:', 25 + complianceWidth + 10, currentY);
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text(reportData.position || 'Operations Manager', 80 + complianceWidth, currentY);
      currentY += signatureRowHeight;
      const currentDate = new Date();
      const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text('Date Reported:', 25, currentY);
      doc.fontSize(9).font('Helvetica').fillColor('#000000').text(reportData.dateReported || formattedDate, 120, currentY);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text('Signed:', 25 + complianceWidth + 10, currentY);
      if (reportData.signatureImage) {
        doc.image(Buffer.from(reportData.signatureImage, 'base64'), { fit: [50, 20], x: 80 + complianceWidth, y: currentY - 5 });
      } else {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#000000').text('', 80 + complianceWidth, currentY);
      }
      currentY += signatureRowHeight + 20;
      const footerY = pageHeight - 80;
      const footerText = [
        'The following apply unless otherwise stated under remarks',
        'Test results reported only relate to the items tested and apply to the sample as received.',
        'This report shall not be reproduced except in full without approval of the Laboratory.',
        'The laboratory does not apply a conformity statement to the Test Report as standard, unless specifically requested by the Client.',
        'All Remaining samples/remnants will be disposed of one month from today.'
      ];
      footerText.forEach((line, index) => {
        doc.fontSize(7).font('Helvetica').fillColor('#000000').text(line, 25, footerY + (index * 10), { width: contentWidth - 120, align: 'left' });
      });

      const docInfoX = pageWidth - 120;
      const lineSpacing = 10;
      let docInfoY = footerY;

      // Render "LTPIB"
      doc.fontSize(7).font('Helvetica').fillColor('#000000').text('LTPIB', docInfoX, docInfoY);
      docInfoY += lineSpacing;

      // Render "DOC No."
      const docNoText = `DOC No.: ${reportData.testInfo?.documentNumber || 'STP04 & STP05 / AMTSSUITE061WS-002'}`;
      const docNoHeight = doc.heightOfString(docNoText, { width: 120, align: 'left' });
      doc.fontSize(7).font('Helvetica').fillColor('#000000').text(docNoText, docInfoX, docInfoY, { width: 120, align: 'left' });
      docInfoY += docNoHeight + lineSpacing;

      // Render "Revision"
      const revisionText = `Revision: ${reportData.testInfo?.revisionNumber || '001'}`;
      doc.fontSize(7).font('Helvetica').fillColor('#000000').text(revisionText, docInfoX, docInfoY);
      docInfoY += lineSpacing;

      // Render "Issued"
      const issuedText = `Issued: ${reportData.testInfo?.issueDate || 'Dec 2024'}`;
      doc.fontSize(7).font('Helvetica').fillColor('#000000').text(issuedText, docInfoX, docInfoY);
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
    const { htmlContent } = req.body;

    // Use Claude to analyze the data and extract structured information
    const analysisResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 5000,
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

IMPORTANT INSTRUCTIONS FOR SPECIFIC TEST TYPES: (Sample Fields of Calculated Properties: So please generate the calculated Properties fields according to the test type like in the below conditions. And generate the graph data according to the graph axis in each example in the below conditions. Of course, the data is related nothing among the below things, you can generate as you mind.)

- Determination of water content - soils
Water Content (%)
Material Description: 
Lower Limit: 
Upper Limit: 

(Graph Axis: which you want)

- Particle size distribution : Soils
Sieve Size, Passing (Array)

(Graph Axis: Sieze Sizes vs Percentage Passing)

- Determination of particle density - gas jar method
Particle Density(Mg/m3):
Material Description:

(Graph Axis: which you want)
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

(Graph Axis: Liquid Limit vs Plasticity Index)

- Rammer/Hammer Maximum Dry Density/Water Content Relationship
Grading Zone
Maximum Dry Density
Optimum Water Content
Dry Mass retained on 20 mm Test Sieve
Dry Mass retained on 37.5 mm Test
Measured Particle Density
Assumed Particle Density

(Graph Axis: Water Content (%) vs Dry Density (Mg/m3))

- Moisture Condition Value
Moisture Condition Value
Natural Water Content (%)
Percentage Retained on 20mm Sieve (%)
Interpretation of Curve
Preparation Method

(Graph Axis: Moisture Condition Value vs Change in penetration)

- Water Content Relation
Array (Test No, MCV, Water Content)
Percentage Retained on 20mm Sieve (%)

(Graph Axis: Moisture Condition Value vs Water Content (%))

- Determination of california Bearing ratio
Test Result-Top (Load on Plunger @ 2.5mm Penetration, CBR Value @ 2.5mm Penetration, Load on Plunger @ 5.0 mm Penetration, CBR Value @ 5.0mm Penetration, Top Part Water Content
CBR Value for Top Part)

Test Result-Base (Load on Plunger @ 2.5mm Penetration, CBR Value @ 2.5mm Penetration, Load on Plunger @ 5.0 mm Penetration, CBR Value @ 5.0mm Penetration, Top Part Water Content
CBR Value for Top Part)

(Graph Axis: Penetration Depth vs Penetration Resistance (kN))

- Determination of Water Content of Aggregates
Water Content (%)
Material Description
Lower Limit
Upper Limit

(Graph Axis: which you want)

- Determination of Geometrical Properties of Aggregates (Constituent Classification)
Test Drying Temperature
Floating Particles
Cohesive, Gypsum, Floating Wood, Plastic & Rubber
Concrete: Concrete Products, Mortar & Concrete, Masonry Units
Unbound Aggregate: Natural Stone, & Hydraulically Bound Aggregate
Clay Masonry Units: Calcium Silicate Masonry Units, Aerated non-Floating Concrete
Bituminous Materials
Glass

(Graph Axis: which you want)

- Determinatin of In-Situ Shear Value - Hand Shear Vane Method
The same data as the test data

(Graph Axis: which you want)

- Aggregate Particles between X mm and Y mm
Mass of Dry Sample Tested
Particle Density (prd)
Particle Density(pssd)
Apparent Particle Density (Pa)
Water Absorption (Wa)

(Graph Axis: which you want)

- Los Angeles Abrasion - Standard Method
The Los Angeles Coefficient (LA)
Upper Aggregate Size (mm)
Lower Aggregate Size (mm)

(Graph Axis: which you want)

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

(Graph Axis: which you want)

- Concrete Cube Compressive Strenth
The same data as the test specimen details

(Graph Axis: which you want)

- Determination of Chloride Migration Coefficient
Comparison of Specimens of the following fields
1. Measured Specimen Thichness (mm)
2. Measured Chloride Pnetration (mm)
3. Mean Chloride Migration Coefficient
4. Variation of Chloride Migration Coefficient
Comments on Testing

(Graph Axis: which you want)

- Plate Bearing Load Test (CBR)
Maximum Applied Pressure
Maximum Deformation
Pressure at 1.25mm Settlement
K Value
Modulus of Subgrade Reaction
Corrected Modulus of Subgrade Reaction:
Approximate CBR value (%)

(Graph Axis: Average Settlement vs Bearing Pressure (kN/m3))

- Estimation of CBR by Dynamic Cone Penetrometer Method
Depth from (mm)
Depth to (mm)
No. of Blows
Blow Rate (mm/Blow)
Estimated CBR (%)

(Graph Axis: Which you want)

- Concrete Pour Record - Slump Test / Flow Table Test, Air Content & Density
The same data as the test data

(Graph Axis: Which you want)

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

    const missingFieldsResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 2000,
      temperature: 0.2,
      system: `You are an expert in materials testing. Please analyze the following test information and return an array of missing essential field names as simple strings. The fields to check are (if there is a field which is the similar field, it is okay.): testTitle, testLocation, issueNumber, revIssueNumber, methodUsed, testerName, testCondition.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(reportData.testInfo)
            }
          ]
        }
      ]
    });

    // Extract missing fields as an array of strings

    res.json({ missingFields: JSON.parse(missingFieldsResponse.content[0].text), reportData });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { missingFieldValues, reportData } = req.body;

    // Update reportData with missing field values
    Object.assign(reportData.testInfo, missingFieldValues);


    // Generate graphs from the extracted data
    const graphs = await generateGraphs(reportData.graphData || []);

    // Create PDF with the updated report data and graphs
    const { pdfBase64 } = await createPDF(reportData, graphs);

    // Send response with PDF
    res.json({ pdfBase64 });
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

// THE END