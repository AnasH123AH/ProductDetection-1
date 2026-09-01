/**
 * VisionaryAI Analytics & Insights Module
 * Renders interactive trend lines, class distribution charts, and confidence tables.
 */

const AnalyticsModule = {
  currentDays: 7,
  currentProductFilter: 'All',

  init() {
    const timeframeSelect = document.getElementById('analyticsTimeframe');
    const productSelect = document.getElementById('analyticsProductFilter');

    if (timeframeSelect) {
      timeframeSelect.addEventListener('change', (e) => {
        this.currentDays = parseInt(e.target.value);
        this.loadAnalytics();
      });
    }

    if (productSelect) {
      productSelect.addEventListener('change', (e) => {
        this.currentProductFilter = e.target.value;
        this.loadAnalytics();
      });
    }
  },

  async loadAnalytics() {
    const container = document.getElementById('analyticsTrendsContainer');
    const tbody = document.getElementById('analyticsBreakdownTbody');
    if (!container) return;

    if (tbody && typeof renderSkeletonRows === 'function') {
      renderSkeletonRows(tbody, 6, 4);
    }

    try {
      const data = await Api.getAnalytics(this.currentDays, this.currentProductFilter);

      // Render Trends Chart on Canvas
      this.renderTrendsChart(data.trends);

      // Render Confidence Breakdown Table
      if (tbody && data.breakdown) {
        if (data.breakdown.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="padding: 0;"></td></tr>`;
          if (typeof renderEmptyState === 'function') {
            renderEmptyState(tbody.querySelector('td'), {
              icon: 'inbox',
              title: 'No detections in this range',
              message: 'Try a wider timeframe or a different product filter.'
            });
          }
        } else {
          tbody.innerHTML = data.breakdown.map((b, i) => {
            const pClass = b.product.toLowerCase();
            return `
              <tr class="row-enter" style="animation-delay: ${i * 40}ms">
                <td><span class="product-badge ${pClass}">${b.product}</span></td>
                <td><strong>${b.count}</strong></td>
                <td><span class="conf-pill" style="color: ${b.avg_confidence >= 90 ? '#059669' : '#D97706'}">${b.avg_confidence}%</span></td>
                <td>${b.min_confidence}%</td>
                <td>${b.max_confidence}%</td>
                <td>
                  <div class="confidence-bar-wrap" style="width: 120px;">
                    <div class="confidence-bar-fill" style="width: ${b.avg_confidence}%;"></div>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
      if (tbody && typeof renderEmptyState === 'function') {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 0;"></td></tr>`;
        renderEmptyState(tbody.querySelector('td'), {
          icon: 'inbox',
          title: 'Unable to load analytics',
          message: 'Check the backend connection and try again.'
        });
      }
    }
  },

  renderTrendsChart(trends) {
    const canvas = document.getElementById('chartAnalyticsTrends');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (canvas._chartRaf) cancelAnimationFrame(canvas._chartRaf);

    const dates = Object.keys(trends || {});
    if (dates.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const totals = dates.map(d => trends[d].total);
    const maxVal = Math.max(...totals, 10);

    const w = canvas.width;
    const h = canvas.height;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 35;
    const chartW = w - paddingLeft - paddingRight;
    const chartH = h - paddingTop - paddingBottom;

    // Points (final positions)
    const step = chartW / (dates.length - 1 || 1);
    const points = dates.map((d, i) => {
      const x = paddingLeft + i * step;
      const y = paddingTop + chartH - (trends[d].total / maxVal) * chartH;
      return { x, y, date: d, count: trends[d].total };
    });

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);

      // Draw Grid Lines
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      ctx.font = "10px 'Plus Jakarta Sans', sans-serif";
      ctx.fillStyle = "#94A3B8";

      for (let i = 0; i <= 4; i++) {
        const y = paddingTop + (chartH / 4) * i;
        const valLabel = Math.round(maxVal - (maxVal / 4) * i);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(w - paddingRight, y);
        ctx.stroke();
        ctx.fillText(valLabel, paddingLeft - 25, y + 3);
      }

      // Only draw the line up to `progress` fraction along the x-axis
      const visibleCount = Math.max(1, Math.ceil(points.length * progress));
      const visiblePoints = points.slice(0, visibleCount);
      // Interpolate the last visible segment for a smooth sweep
      if (visibleCount < points.length && visibleCount > 0) {
        const segProgress = (points.length * progress) - (visibleCount - 1);
        const prev = points[visibleCount - 1];
        const next = points[visibleCount];
        if (next && segProgress >= 0 && segProgress <= 1) {
          visiblePoints[visiblePoints.length - 1] = prev;
          visiblePoints.push({
            x: prev.x + (next.x - prev.x) * segProgress,
            y: prev.y + (next.y - prev.y) * segProgress
          });
        }
      }

      if (visiblePoints.length < 2) return;

      // Draw Gradient Area
      const grad = ctx.createLinearGradient(0, paddingTop, 0, h - paddingBottom);
      grad.addColorStop(0, 'rgba(2, 132, 199, 0.35)');
      grad.addColorStop(1, 'rgba(2, 132, 199, 0.0)');

      ctx.beginPath();
      ctx.moveTo(visiblePoints[0].x, h - paddingBottom);
      visiblePoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(visiblePoints[visiblePoints.length - 1].x, h - paddingBottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw Line
      ctx.beginPath();
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 3;
      visiblePoints.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // Draw Dots & X Labels only for fully-reached points
      points.slice(0, visibleCount).forEach(p => {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label date
        const dShort = p.date.split('-').slice(1).join('/');
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.fillText(dShort, p.x, h - 10);
      });
    }

    const duration = 650;
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    function frame(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      draw(easeOutCubic(progress));
      if (progress < 1) {
        canvas._chartRaf = requestAnimationFrame(frame);
      } else {
        canvas._chartRaf = null;
      }
    }

    canvas._chartRaf = requestAnimationFrame(frame);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AnalyticsModule.init();
});
