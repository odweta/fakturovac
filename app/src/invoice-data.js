const normalizeInvoiceData = (data) => {
    if (!data || !Array.isArray(data.items)) {
        return null;
    }

    const items = data.items.map((item) => ({
        popis: typeof item.popis === 'string' ? item.popis.trim() : '',
        mnozstvi: Number(item.mnozstvi),
        mernaJednotka: typeof item.mernaJednotka === 'string' ? item.mernaJednotka.trim() : '',
        cenaZaMj: Number(item.cenaZaMj)
    }));
    if (items.some((item) => !Number.isFinite(item.mnozstvi)
        || !Number.isFinite(item.cenaZaMj)
        || item.mnozstvi < 0
        || item.cenaZaMj < 0)) {
        return null;
    }

    return {
        supplier: data.supplier || {},
        customer: data.customer || {},
        payment: data.payment || {},
        items,
        total: items.reduce((sum, item) => sum + item.mnozstvi * item.cenaZaMj, 0)
    };
};

module.exports = { normalizeInvoiceData };
