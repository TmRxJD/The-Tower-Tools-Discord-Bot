const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const { SlashCommandBuilder } = require('discord.js');

function getWeekNumber(dateString) {
  const date = new Date(dateString);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function getFirstDayOfWeek(weekNumber, year) {
  // Create January 1st of the given year
  const jan1 = new Date(year, 0, 1);
  // Find the first Monday of the year
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + (8 - jan1.getDay()) % 7);
  // Add weeks to get to the desired week
  const targetDate = new Date(firstMonday);
  targetDate.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
  // Format as MM/DD
  return `${String(targetDate.getMonth() + 1).padStart(2, '0')}/${String(targetDate.getDate()).padStart(2, '0')}`;
}

function formatProductName(productName) {
  return productName
    .replace(/purchase of /gi, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatPlatformName(platformName) {
  return platformName.charAt(0).toUpperCase() + platformName.slice(1).toLowerCase();
}

function standardizeDate(dateString) {
  // Handle different date formats: MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD
  if (dateString.includes('-')) {
    // Already YYYY-MM-DD format
    return dateString;
  }
  const parts = dateString.split('/');
  if (parts.length === 3) {
    const first = parseInt(parts[0]);
    const second = parseInt(parts[1]);
    let third = parts[2];
    let month, day, year;
    if (second > 12) {
      // Second part can't be month, so must be MM/DD/YYYY
      month = first;
      day = second;
      year = third;
    } else if (first > 12) {
      // First part >12, must be DD/MM/YYYY
      day = first;
      month = second;
      year = third;
    } else {
      // Ambiguous, assume MM/DD/YYYY
      month = first;
      day = second;
      year = third;
    }
    // Handle 2-digit years
    if (year.length === 2) {
      year = '20' + year;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Fallback, return as is
  return dateString;
}

function getMonthlyRevenueDisplay(monthlyRevenue) {
  const now = new Date();
  const months = [];
  
  // Get current month and 3 previous months
  for (let i = 0; i < 4; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (monthlyRevenue[monthKey]) {
      months.push(`${monthName}: $${monthlyRevenue[monthKey].toFixed(2)}`);
    }
  }
  
  return months.slice(0, 4).join('\n'); // Limit to 4 months max
}

function getMonthlySalesDisplay(monthlySales) {
  const now = new Date();
  const months = [];
  
  // Get current month and 3 previous months
  for (let i = 0; i < 4; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (monthlySales[monthKey]) {
      months.push(`${monthName}: ${monthlySales[monthKey]} sales`);
    }
  }
  
  return months.slice(0, 4).join('\n'); // Limit to 4 months max
}

function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

function parseCSVFromText(csvText) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = require('stream');
    const readable = new stream.Readable();
    readable.push(csvText);
    readable.push(null);
    
    readable
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

function analyzeData(rows, timeRange = 30, unit = 'days') {
  // Calculate cutoff date for filtering
  const currentDate = new Date();
  const multiplier = unit === 'months' ? 30 : unit === 'weeks' ? 7 : 1;
  const cutoffDate = timeRange === 'all' ? new Date(0) : new Date(currentDate.getTime() - timeRange * multiplier * 24 * 60 * 60 * 1000);
  
  // Filter rows by time range
  const filteredRows = timeRange === 'all' ? rows : rows.filter(row => {
    const rowDate = new Date(standardizeDate(row.purchase_date));
    return rowDate >= cutoffDate;
  });

  // Calculate all months present in the data
  const allMonths = new Set();
  for (const row of rows) {
    const date = standardizeDate(row.purchase_date);
    const dateObj = new Date(date);
    if (!isNaN(dateObj.getTime())) {
      const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      allMonths.add(monthKey);
    }
  }

  let totalRevenue = 0;
  let totalSales = 0;
  let totalPrice = 0;
  let productStats = {};
  let dailyRevenue = {};
  let dailySales = {};
  let monthlyRevenue = {};
  let monthlySales = {};
  let weeklyRevenue = {};
  let weeklySales = {};
  let dayOfWeekRevenue = {};
  let dayOfWeekSales = {};
  let platformStats = {};
  let statusStats = {};

  for (const row of filteredRows) {
    const price = parseFloat(row.price.replace('$', '') || '0');
    const revShare = parseFloat(row.rev_share.replace('$', '') || '0');
    const date = standardizeDate(row.purchase_date);
    const product = row.product_name;
    const platform = row.platform;
    const status = row.status;

    totalPrice += price;
    totalRevenue += revShare;
    totalSales++;

    // Product stats
    if (!productStats[product]) productStats[product] = { count: 0, revenue: 0, price: 0 };
    productStats[product].count++;
    productStats[product].revenue += revShare;
    productStats[product].price += price;

    // Daily stats
    if (!dailyRevenue[date]) {
      dailyRevenue[date] = 0;
      dailySales[date] = 0;
    }
    dailyRevenue[date] += revShare;
    dailySales[date]++;

    // Monthly stats
    const dateObj = new Date(date);
    const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyRevenue[monthKey]) monthlyRevenue[monthKey] = 0;
    monthlyRevenue[monthKey] += revShare;

    // Monthly sales
    if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
    monthlySales[monthKey]++;

    // Weekly stats
    const weekKey = getWeekNumber(date);
    if (!weeklyRevenue[weekKey]) weeklyRevenue[weekKey] = 0;
    weeklyRevenue[weekKey] += revShare;

    // Weekly sales
    if (!weeklySales[weekKey]) weeklySales[weekKey] = 0;
    weeklySales[weekKey]++;

    // Day of week stats
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];
    if (!dayOfWeekRevenue[dayOfWeek]) dayOfWeekRevenue[dayOfWeek] = 0;
    dayOfWeekRevenue[dayOfWeek] += revShare;

    // Day of week sales
    if (!dayOfWeekSales[dayOfWeek]) dayOfWeekSales[dayOfWeek] = 0;
    dayOfWeekSales[dayOfWeek]++;

    // Platform stats
    if (!platformStats[platform]) platformStats[platform] = { count: 0, revenue: 0 };
    platformStats[platform].count++;
    platformStats[platform].revenue += revShare;

    // Status stats
    if (!statusStats[status]) statusStats[status] = { count: 0, revenue: 0 };
    statusStats[status].count++;
    statusStats[status].revenue += revShare;
  }

  // Calculate additional metrics
  const averageOrderValue = totalSales > 0 ? totalPrice / totalSales : 0;
  const averageRevenuePerSale = totalSales > 0 ? totalRevenue / totalSales : 0;
  const dates = Object.keys(dailyRevenue).sort((a, b) => new Date(a) - new Date(b));
  const revenueGrowth = dates.length > 1 ? ((dailyRevenue[dates[dates.length - 1]] - dailyRevenue[dates[0]]) / dailyRevenue[dates[0]]) * 100 : 0;

  // Top products
  const topProducts = Object.entries(productStats)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  // Period totals
  const now = new Date();
  const periods = {
    last3Days: 3,
    last7Days: 7,
    last2Weeks: 14,
    last4Weeks: 28,
  };
  const periodRevenue = {};
  for (const [period, days] of Object.entries(periods)) {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    periodRevenue[period] = 0;
    for (const [dateStr, rev] of Object.entries(dailyRevenue)) {
      const date = new Date(dateStr);
      if (date >= cutoff) {
        periodRevenue[period] += rev;
      }
    }
  }

  // Cumulative revenue
  const cumulativeRevenue = [];
  let cumSum = 0;
  for (const date of dates) {
    cumSum += dailyRevenue[date];
    cumulativeRevenue.push({ date, cumulative: cumSum });
  }

  // Revenue growth %
  const revenueGrowthPct = [];
  for (let i = 1; i < dates.length; i++) {
    const prev = dailyRevenue[dates[i-1]];
    const curr = dailyRevenue[dates[i]];
    const growth = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    revenueGrowthPct.push({ date: dates[i], growth });
  }

  // Avg revenue per sale over time
  const avgRevenuePerSaleOverTime = dates.map(date => ({
    date,
    avg: dailySales[date] > 0 ? dailyRevenue[date] / dailySales[date] : 0
  }));

  // Top earners (top products, days, weeks)
  const topEarningProducts = topProducts;
  const topEarningDays = Object.entries(dayOfWeekRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topEarningWeeks = Object.entries(weeklyRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Product revenue over time (simplified - top 5 products)
  const productRevenueOverTime = {};
  const topProductNames = topProducts.map(([name]) => name);
  for (const row of filteredRows) {
    const date = standardizeDate(row.purchase_date);
    const product = row.product_name;
    const revShare = parseFloat(row.rev_share.replace('$', '') || '0');
    if (topProductNames.includes(product)) {
      if (!productRevenueOverTime[date]) productRevenueOverTime[date] = {};
      if (!productRevenueOverTime[date][product]) productRevenueOverTime[date][product] = 0;
      productRevenueOverTime[date][product] += revShare;
    }
  }

  // Revenue concentration (Pareto)
  const sortedProductsForPareto = Object.entries(productStats)
    .sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevForPareto = sortedProductsForPareto.reduce((sum, [, stats]) => sum + stats.revenue, 0);
  let cumPct = 0;
  const revenueConcentration = sortedProductsForPareto.map(([name, stats], index) => {
    cumPct += (stats.revenue / totalRevForPareto) * 100;
    return { product: name, revenue: stats.revenue, cumulativePct: cumPct, rank: index + 1 };
  });

  // Rolling avg revenue (7-day moving average)
  const rollingAvgRevenue = [];
  const windowSize = 7;
  for (let i = windowSize - 1; i < dates.length; i++) {
    let sum = 0;
    for (let j = i - windowSize + 1; j <= i; j++) {
      sum += dailyRevenue[dates[j]];
    }
    rollingAvgRevenue.push({ date: dates[i], avg: sum / windowSize });
  }

  // Rev share distribution - show cumulative revenue share by range
  const revShares = filteredRows.map(row => parseFloat(row.rev_share.replace('$', '') || '0'));
  const sortedShares = revShares.sort((a, b) => a - b);
  const totalRevShare = revShares.reduce((sum, share) => sum + share, 0);

  // Create percentile bins
  const percentiles = [0, 10, 25, 50, 75, 90, 95, 99, 100];
  const revShareDistribution = percentiles.map((percentile, index) => {
    const valueIndex = Math.floor((percentile / 100) * (sortedShares.length - 1));
    const value = sortedShares[valueIndex];
    const cumulativeShare = sortedShares.slice(0, valueIndex + 1).reduce((sum, share) => sum + share, 0);
    const cumulativePct = (cumulativeShare / totalRevShare) * 100;

    return {
      percentile: `${percentile}${index === percentiles.length - 1 ? '+' : ''}th`,
      value: value,
      cumulativePct: cumulativePct
    };
  });

  return {
    totalRevenue,
    totalSales,
    totalPrice,
    averageOrderValue,
    averageRevenuePerSale,
    revenueGrowth,
    productStats,
    dailyRevenue,
    dailySales,
    monthlyRevenue,
    monthlySales,
    weeklyRevenue,
    weeklySales,
    dayOfWeekRevenue,
    dayOfWeekSales,
    platformStats,
    statusStats,
    topProducts,
    dates,
    periodRevenue,
    cumulativeRevenue,
    revenueGrowthPct,
    avgRevenuePerSaleOverTime,
    topEarningProducts,
    topEarningDays,
    topEarningWeeks,
    productRevenueOverTime,
    revenueConcentration,
    rollingAvgRevenue,
    revShareDistribution,
  };
}

async function makeChart(type, data, timeRange = 30) {
  const chart = new QuickChart();
  
  if (type === 'over_time') {
    const daysToShow = timeRange === 'all' ? data.dates.length : Math.min(timeRange, data.dates.length);
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.dates.slice(-daysToShow),
        datasets: [{
          label: 'Revenue',
          data: data.dates.slice(-daysToShow).map(date => parseFloat(data.dailyRevenue[date].toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }, {
          label: 'Sales',
          data: data.dates.slice(-daysToShow).map(date => data.dailySales[date]),
          fill: false,
          borderColor: '#ff3333',
          backgroundColor: '#ff3333',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'by_product') {
    const sortedProducts = Object.entries(data.productStats)
      .sort((a, b) => b[1].revenue - a[1].revenue);
    chart.setConfig({
      type: 'bar',
      data: {
        labels: sortedProducts.map(([name, _]) => formatProductName(name).substring(0, 15)),
        datasets: [{
          label: 'Revenue',
          data: sortedProducts.map(([_, stats]) => parseFloat(stats.revenue.toFixed(2))),
          backgroundColor: '#0066ff',
        }, {
          label: 'Sales',
          data: sortedProducts.map(([_, stats]) => stats.count),
          backgroundColor: '#ff3333',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'by_platform') {
    chart.setConfig({
      type: 'bar',
      data: {
        labels: Object.keys(data.platformStats).map(plat => formatPlatformName(plat).substring(0, 10)),
        datasets: [{
          label: 'Revenue',
          data: Object.values(data.platformStats).map(p => parseFloat(p.revenue.toFixed(2))),
          backgroundColor: '#0066ff',
        }, {
          label: 'Sales',
          data: Object.values(data.platformStats).map(p => p.count),
          backgroundColor: '#ff3333',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'by_month') {
    const sortedMonths = Object.keys(data.monthlyRevenue).sort();
    chart.setConfig({
      type: 'bar',
      data: {
        labels: sortedMonths,
        datasets: [{
          label: 'Revenue',
          data: sortedMonths.map(month => parseFloat(data.monthlyRevenue[month].toFixed(2))),
          backgroundColor: '#0066ff',
        }, {
          label: 'Sales',
          data: sortedMonths.map(month => data.monthlySales[month]),
          backgroundColor: '#ff3333',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              min: 0,
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          }],
          xAxes: [{
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          }]
        }
      }
    });
  } else if (type === 'by_day_of_week') {
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    chart.setConfig({
      type: 'bar',
      data: {
        labels: dayOrder,
        datasets: [{
          label: 'Revenue',
          data: dayOrder.map(day => parseFloat((data.dayOfWeekRevenue[day === 'Mon' ? 'Monday' : day === 'Tue' ? 'Tuesday' : day === 'Wed' ? 'Wednesday' : day === 'Thu' ? 'Thursday' : day === 'Fri' ? 'Friday' : day === 'Sat' ? 'Saturday' : 'Sunday'] || 0).toFixed(2))),
          backgroundColor: '#0066ff',
        }, {
          label: 'Sales',
          data: dayOrder.map(day => data.dayOfWeekSales[day === 'Mon' ? 'Monday' : day === 'Tue' ? 'Tuesday' : day === 'Wed' ? 'Wednesday' : day === 'Thu' ? 'Thursday' : day === 'Fri' ? 'Friday' : day === 'Sat' ? 'Saturday' : 'Sunday'] || 0),
          backgroundColor: '#ff3333',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              min: 0,
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          }],
          xAxes: [{
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          }]
        }
      }
    });
  } else if (type === 'by_week') {
    const sortedWeeks = Object.keys(data.weeklyRevenue).sort();
    const currentYear = new Date().getFullYear();
    chart.setConfig({
      type: 'bar',
      data: {
        labels: sortedWeeks.map(week => getFirstDayOfWeek(parseInt(week), currentYear)),
        datasets: [{
          label: 'Revenue',
          data: sortedWeeks.map(week => parseFloat(data.weeklyRevenue[week].toFixed(2))),
          backgroundColor: '#0066ff',
        }, {
          label: 'Sales',
          data: sortedWeeks.map(week => data.weeklySales[week]),
          backgroundColor: '#ff3333',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              min: 0,
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          }],
          xAxes: [{
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          }]
        }
      }
    });
  } else if (type === 'cumulative_revenue') {
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.cumulativeRevenue.map(d => d.date),
        datasets: [{
          label: 'Cumulative Revenue',
          data: data.cumulativeRevenue.map(d => parseFloat(d.cumulative.toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'revenue_growth_pct') {
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.revenueGrowthPct.map(d => d.date),
        datasets: [{
          label: 'Revenue Growth %',
          data: data.revenueGrowthPct.map(d => parseFloat(d.growth.toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          },
          y: {
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' },
              callback: function(value) {
                return value + '%';
              }
            },
            grid: { color: '#333333' }
          }
        }
      }
    });
  } else if (type === 'avg_revenue_per_sale') {
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.avgRevenuePerSaleOverTime.map(d => d.date),
        datasets: [{
          label: 'Avg Revenue per Sale',
          data: data.avgRevenuePerSaleOverTime.map(d => parseFloat(d.avg.toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'top_earners') {
    // Create a bar chart for top products instead of table
    const topProducts = data.topEarningProducts.slice(0, 5);
    chart.setConfig({
      type: 'bar',
      data: {
        labels: topProducts.map(([name]) => formatProductName(name).substring(0, 15)),
        datasets: [{
          label: 'Revenue',
          data: topProducts.map(([, stats]) => parseFloat(stats.revenue.toFixed(2))),
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' },
              maxRotation: 45
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'product_revenue_over_time') {
    const dates = Object.keys(data.productRevenueOverTime).sort();
    const datasets = data.topEarningProducts.slice(0, 5).map(([product], index) => ({
      label: formatProductName(product).substring(0, 15),
      data: dates.map(date => parseFloat((data.productRevenueOverTime[date]?.[product] || 0).toFixed(2))),
      backgroundColor: ['#0066ff', '#ff3333', '#00ff88', '#ffd23f', '#a855f7'][index],
    }));
    chart.setConfig({
      type: 'bar',
      data: {
        labels: dates,
        datasets: datasets,
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            stacked: true,
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            stacked: true,
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'revenue_concentration') {
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.revenueConcentration.map(d => formatProductName(d.product).substring(0, 12)),
        datasets: [{
          label: 'Cumulative %',
          data: data.revenueConcentration.map(d => parseFloat(d.cumulativePct.toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' },
              maxRotation: 45
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'rolling_avg_revenue') {
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.rollingAvgRevenue.map(d => d.date),
        datasets: [{
          label: '7-Day Rolling Avg Revenue',
          data: data.rollingAvgRevenue.map(d => parseFloat(d.avg.toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          legend: { 
            labels: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }
          }
        },
        scales: {
          x: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          },
          y: { 
            ticks: { 
              color: '#ffffff',
              font: { weight: 'bold' }
            }, 
            grid: { color: '#333333' } 
          }
        }
      }
    });
  } else if (type === 'rev_share_distribution') {
    chart.setConfig({
      type: 'line',
      data: {
        labels: data.revShareDistribution.map(d => d.percentile),
        datasets: [{
          label: 'Cumulative Revenue Share %',
          data: data.revShareDistribution.map(d => parseFloat(d.cumulativePct.toFixed(2))),
          fill: false,
          borderColor: '#0066ff',
          backgroundColor: '#0066ff',
        }],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Revenue Share Distribution (Cumulative)',
            color: '#ffffff'
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' }
            },
            grid: { color: '#333333' }
          },
          y: {
            ticks: {
              color: '#ffffff',
              font: { weight: 'bold' },
              callback: function(value) {
                return value + '%';
              }
            },
            grid: { color: '#333333' }
          }
        }
      }
    });
  }
  chart.setWidth(600).setHeight(300).setBackgroundColor('#1a1a1a');
  return await chart.toBinary();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('earnings')
    .setDescription('Show sales stats and charts')
    .addAttachmentOption(option =>
      option.setName('csv_file')
        .setDescription('Upload your transaction history CSV file')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      if (error.code !== 10062) {
        throw error;
      }
      // Ignore unknown interaction error - interaction may already be handled
      return; // Don't continue if interaction is already handled
    }
    
    // Get the uploaded CSV file
    const csvFile = interaction.options.getAttachment('csv_file');
    if (!csvFile) {
      await interaction.editReply('Please upload a CSV file with your transaction data.');
      return;
    }

    // Check if it's actually a CSV file
    if (!csvFile.name.toLowerCase().endsWith('.csv')) {
      await interaction.editReply('Please upload a valid CSV file.');
      return;
    }

    try {
      // Fetch the CSV content from the attachment URL
      const response = await fetch(csvFile.url);
      if (!response.ok) {
        await interaction.editReply('Failed to download the CSV file. Please try again.');
        return;
      }
      
      const csvText = await response.text();
      const rows = await parseCSVFromText(csvText);
      
      // Store current selections
      let currentChart = 'over_time';
      let currentTimeRange = 'all';
      
      const stats = analyzeData(rows, currentTimeRange, 'days');
      const chartBuffer = await makeChart(currentChart, stats, currentTimeRange);

    // Create initial embed
    const embed = new EmbedBuilder()
      .setTitle('Earnings Summary')
      .setDescription(`**Total Revenue:** $${stats.totalRevenue.toFixed(2)}\n**Total Sales:** ${stats.totalSales}\n**Average Order Value:** $${stats.averageOrderValue.toFixed(2)}\n**Average Revenue per Sale:** $${stats.averageRevenuePerSale.toFixed(2)}\n**Revenue Growth:** ${stats.revenueGrowth.toFixed(2)}%\n\n**Top Products:**`)
      .addFields(
        ...stats.topProducts.map(([name, data], index) => ({
          name: `${index + 1}. ${formatProductName(name)} ($${(data.price / data.count).toFixed(2)})`,
          value: `Qty Sold: ${data.count}\nSales $: $${data.revenue.toFixed(2)}`,
          inline: true
        })),
        { name: 'Platforms', value: Object.entries(stats.platformStats).map(([plat, data]) => `${formatPlatformName(plat)}: ${data.count} sales`).join('\n'), inline: true },
        { name: 'Recent Revenue', value: (() => {
          const periods = [
            { label: 'Last 7 Days', days: 7, key: 'last7Days' },
            { label: 'Last 2 Weeks', days: 14, key: 'last2Weeks' },
            { label: 'Last 4 Weeks', days: 28, key: 'last4Weeks' },
          ];
          let relevantKeys = [];
          if (currentTimeRange === 7) {
            relevantKeys = ['last7Days'];
          } else if (currentTimeRange === 14) {
            relevantKeys = ['last7Days', 'last2Weeks'];
          } else if (currentTimeRange === 30) {
            relevantKeys = ['last7Days', 'last2Weeks', 'last4Weeks'];
          } else {
            relevantKeys = periods.map(p => p.key);
          }
          const relevantPeriods = periods.filter(p => relevantKeys.includes(p.key));
          return relevantPeriods.map(p => `${p.label}: $${stats.periodRevenue[p.key].toFixed(2)}`).join('\n');
        })(), inline: true },
        { name: 'Monthly Revenue', value: getMonthlyRevenueDisplay(stats.monthlyRevenue), inline: true },
        { name: 'Monthly Sales', value: getMonthlySalesDisplay(stats.monthlySales), inline: true }
      )
      .setImage('attachment://chart.png')
      .setColor('Green');

    // Create initial dropdown components
    const chartRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('earnings_chart_select')
          .setPlaceholder('Over Time')
          .addOptions(
            { label: 'Over Time', value: 'over_time' },
            { label: 'By Product', value: 'by_product' },
            { label: 'By Platform', value: 'by_platform' },
            { label: 'By Month', value: 'by_month' },
            { label: 'By Week', value: 'by_week' },
            { label: 'By Day of Week', value: 'by_day_of_week' },
            { label: 'Cumulative Revenue', value: 'cumulative_revenue' },
            { label: 'Revenue Growth %', value: 'revenue_growth_pct' },
            { label: 'Avg Revenue per Sale', value: 'avg_revenue_per_sale' },
            { label: 'Top Earners', value: 'top_earners' },
            { label: 'Product Revenue Over Time', value: 'product_revenue_over_time' },
            { label: 'Revenue Concentration', value: 'revenue_concentration' },
            { label: 'Rolling Avg Revenue', value: 'rolling_avg_revenue' },
            { label: 'Rev Share Distribution', value: 'rev_share_distribution' }
          )
      );

    const timeRangeRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('earnings_time_range_select')
          .setPlaceholder('All Time')
          .addOptions(
            { label: '7 Days', value: '7' },
            { label: '14 Days', value: '14' },
            { label: '30 Days', value: '30' },
            { label: '90 Days', value: '90' },
            { label: 'All Time', value: 'all' }
          )
      );

    // Send initial reply
    const message = await interaction.editReply({ 
      embeds: [embed], 
      components: [chartRow, timeRangeRow],
      files: [{ attachment: chartBuffer, name: 'chart.png' }]
    });

    // Create a collector for both select menus
    const collector = interaction.channel.createMessageComponentCollector({
      componentType: 3, // StringSelectMenu
      time: 300000, // 5 minutes
      filter: (i) => i.message.id === message.id
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) return; // Only allow the command user
      await i.deferUpdate();
      
      const selectedValue = i.values[0];
      let needsUpdate = false;
      
      if (i.customId === 'earnings_chart_select') {
        currentChart = selectedValue;
        if (currentChart.includes('month') || currentChart.includes('week')) {
          currentTimeRange = 'all';
        }
        needsUpdate = true;
      } else if (i.customId === 'earnings_time_range_select') {
        currentTimeRange = selectedValue === 'all' ? 'all' : parseInt(selectedValue);
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        // Re-analyze data with new time range
        const unit = currentChart.includes('month') ? 'months' : currentChart.includes('week') ? 'weeks' : 'days';
        const newStats = analyzeData(rows, currentTimeRange, unit);
        
        const chartLabels = {
          'over_time': 'Over Time',
          'by_product': 'By Product',
          'by_platform': 'By Platform',
          'by_month': 'By Month',
          'by_week': 'By Week',
          'by_day_of_week': 'By Day of Week',
          'cumulative_revenue': 'Cumulative Revenue',
          'revenue_growth_pct': 'Revenue Growth %',
          'avg_revenue_per_sale': 'Avg Revenue per Sale',
          'top_earners': 'Top Earners',
          'product_revenue_over_time': 'Product Revenue Over Time',
          'revenue_concentration': 'Revenue Concentration',
          'rolling_avg_revenue': 'Rolling Avg Revenue',
          'rev_share_distribution': 'Rev Share Distribution'
        };
        
        const timeOptions = currentChart.includes('month') ? [
          { label: '1 Month', value: '1' },
          { label: '3 Months', value: '3' },
          { label: '6 Months', value: '6' },
          { label: '12 Months', value: '12' },
          { label: 'All Time', value: 'all' }
        ] : currentChart.includes('week') ? [
          { label: '1 Week', value: '1' },
          { label: '2 Weeks', value: '2' },
          { label: '4 Weeks', value: '4' },
          { label: '8 Weeks', value: '8' },
          { label: 'All Time', value: 'all' }
        ] : [
          { label: '7 Days', value: '7' },
          { label: '14 Days', value: '14' },
          { label: '30 Days', value: '30' },
          { label: '90 Days', value: '90' },
          { label: 'All Time', value: 'all' }
        ];
        
        const timeRangeLabels = {
          1: currentChart.includes('month') ? '1 Month' : currentChart.includes('week') ? '1 Week' : '7 Days',
          3: '3 Months',
          6: '6 Months',
          12: '12 Months',
          2: '2 Weeks',
          4: '4 Weeks',
          8: '8 Weeks',
          7: '7 Days',
          14: '14 Days',
          30: '30 Days',
          90: '90 Days',
          'all': 'All Time'
        };
        
        const newChartBuffer = await makeChart(currentChart, newStats, currentTimeRange);
        const newEmbed = new EmbedBuilder()
          .setTitle('Earnings Summary')
          .setDescription(`**Total Revenue:** $${newStats.totalRevenue.toFixed(2)}\n**Total Sales:** ${newStats.totalSales}\n**Average Order Value:** $${newStats.averageOrderValue.toFixed(2)}\n**Average Revenue per Sale:** $${newStats.averageRevenuePerSale.toFixed(2)}\n**Revenue Growth:** ${newStats.revenueGrowth.toFixed(2)}%\n\n**Top Products:** Qty Sold | Product Name (Price) | Sales $`)
          .addFields(
            ...newStats.topProducts.map(([name, data], index) => ({
              name: `${index + 1}. ${formatProductName(name)} ($${(data.price / data.count).toFixed(2)})`,
              value: `Qty Sold: ${data.count}\nSales $: $${data.revenue.toFixed(2)}`,
              inline: true
            })),
            { name: 'Platforms', value: Object.entries(newStats.platformStats).map(([plat, data]) => `${formatPlatformName(plat)}: ${data.count} sales`).join('\n'), inline: true },
            { name: 'Recent Revenue', value: (() => {
              const periods = [
                { label: 'Last 7 Days', days: 7, key: 'last7Days' },
                { label: 'Last 2 Weeks', days: 14, key: 'last2Weeks' },
                { label: 'Last 4 Weeks', days: 28, key: 'last4Weeks' },
              ];
              let relevantKeys = [];
              if (currentTimeRange === 7) {
                relevantKeys = ['last7Days'];
              } else if (currentTimeRange === 14) {
                relevantKeys = ['last7Days', 'last2Weeks'];
              } else if (currentTimeRange === 30) {
                relevantKeys = ['last7Days', 'last2Weeks', 'last4Weeks'];
              } else {
                relevantKeys = periods.map(p => p.key);
              }
              const relevantPeriods = periods.filter(p => relevantKeys.includes(p.key));
              return relevantPeriods.map(p => `${p.label}: $${newStats.periodRevenue[p.key].toFixed(2)}`).join('\n');
            })(), inline: true },
            { name: 'Monthly Revenue', value: getMonthlyRevenueDisplay(newStats.monthlyRevenue), inline: true },
            { name: 'Monthly Sales', value: getMonthlySalesDisplay(newStats.monthlySales), inline: true }
          )
          .setImage('attachment://chart.png')
          .setColor('Green');
        
        // Update the dropdown placeholders to show current selections
        const updatedChartRow = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('earnings_chart_select')
              .setPlaceholder(`${chartLabels[currentChart]}`)
              .addOptions(
                { label: 'Over Time', value: 'over_time' },
                { label: 'By Product', value: 'by_product' },
                { label: 'By Platform', value: 'by_platform' },
                { label: 'By Month', value: 'by_month' },
                { label: 'By Week', value: 'by_week' },
                { label: 'By Day of Week', value: 'by_day_of_week' },
                { label: 'Cumulative Revenue', value: 'cumulative_revenue' },
                { label: 'Revenue Growth %', value: 'revenue_growth_pct' },
                { label: 'Avg Revenue per Sale', value: 'avg_revenue_per_sale' },
                { label: 'Top Earners', value: 'top_earners' },
                { label: 'Product Revenue Over Time', value: 'product_revenue_over_time' },
                { label: 'Revenue Concentration', value: 'revenue_concentration' },
                { label: 'Rolling Avg Revenue', value: 'rolling_avg_revenue' },
                { label: 'Rev Share Distribution', value: 'rev_share_distribution' }
              )
          );
        
        const updatedTimeRangeRow = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('earnings_time_range_select')
              .setPlaceholder(`${timeRangeLabels[currentTimeRange] || 'All Time'}`)
              .addOptions(timeOptions)
          );
        
        await i.editReply({ 
          embeds: [newEmbed], 
          components: [updatedChartRow, updatedTimeRangeRow],
          files: [{ attachment: newChartBuffer, name: 'chart.png' }]
        });
      }
    });

    collector.on('end', () => {
      // Optionally disable the menus
      chartRow.components[0].setDisabled(true);
      timeRangeRow.components[0].setDisabled(true);
      interaction.editReply({ components: [chartRow, timeRangeRow] }).catch(() => {});
    });
    } catch (error) {
      console.error('Error processing earnings command:', error);
      await interaction.editReply('An error occurred while processing your CSV file. Please make sure it\'s a valid transaction history CSV.');
    }
  },
};
