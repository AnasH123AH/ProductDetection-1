/**
 * VisionaryAI Products Catalogue Module
 * Displays the 4 Ultralytics YOLO classes: Trident, Donut, Pickers, Bahia
 */

const ProductsModule = {
  async loadProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    try {
      const products = await Api.getProducts();

      grid.innerHTML = products.map(p => {
        const pClass = p.name.toLowerCase();
        return `
          <div class="product-card">
            <img src="${p.image}" alt="${p.name}" class="product-card-image" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394A3B8\\' stroke-width=\\'2\\'><rect width=\\'18\\' height=\\'18\\' x=\\'3\\' y=\\'3\\' rx=\\'2\\'/></svg>'">
            <div class="product-card-body">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span class="product-badge ${pClass}">${p.name}</span>
                <span style="font-size: 0.75rem; color: #94A3B8; font-family: var(--font-mono);">${p.sku || 'SKU-00' + p.id}</span>
              </div>
              <h3 class="product-card-title">${p.name}</h3>
              <p style="font-size: 0.8rem; color: #64748B;">Category: ${p.category || 'Retail Product'}</p>

              <div class="product-stats-list">
                <div class="product-stat-row">
                  <span>Total Ingestions:</span>
                  <span class="product-stat-val">${p.total_detections}</span>
                </div>
                <div class="product-stat-row">
                  <span>Avg Confidence:</span>
                  <span class="product-stat-val" style="color: ${p.avg_confidence >= 90 ? '#059669' : '#D97706'}">${p.avg_confidence}%</span>
                </div>
                <div class="product-stat-row">
                  <span>Last Seen:</span>
                  <span class="product-stat-val">${p.last_detected}</span>
                </div>
                <div class="product-stat-row">
                  <span>Share of Total:</span>
                  <span class="product-stat-val">${p.percentage}%</span>
                </div>
              </div>

              <div class="confidence-bar-wrap" style="margin-top: 0.5rem;">
                <div class="confidence-bar-fill" style="width: ${p.percentage * 2.5}%;"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load products catalogue:', err);
    }
  }
};
