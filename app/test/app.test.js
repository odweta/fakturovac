const { normalizeInvoiceData } = require('../src/invoice-data');

describe('normalizeInvoiceData', () => {
    test('calculates the total from validated line items', () => {
        const invoice = normalizeInvoiceData({
            supplier: {},
            customer: {},
            payment: {},
            total: 999,
            items: [
                { popis: 'Práce', mnozstvi: '2', mernaJednotka: 'hod', cenaZaMj: '125.5' },
                { popis: 'Materiál', mnozstvi: 1, mernaJednotka: 'ks', cenaZaMj: 50 }
            ]
        });

        expect(invoice.total).toBe(301);
        expect(invoice.items[0]).toEqual({
            popis: 'Práce',
            mnozstvi: 2,
            mernaJednotka: 'hod',
            cenaZaMj: 125.5
        });
    });

    test('rejects negative or non-numeric line item values', () => {
        expect(normalizeInvoiceData({ items: [
            { mnozstvi: -1, cenaZaMj: 10 }
        ] })).toBeNull();
        expect(normalizeInvoiceData({ items: [
            { mnozstvi: 'not-a-number', cenaZaMj: 10 }
        ] })).toBeNull();
    });

    test('accepts a valid signature data URL and rejects invalid ones', () => {
        const withValidSignature = normalizeInvoiceData({
            items: [{ mnozstvi: 1, cenaZaMj: 10 }],
            signature: 'data:image/png;base64,aGVsbG8='
        });
        expect(withValidSignature.signature).toBe('data:image/png;base64,aGVsbG8=');

        const withInvalidSignature = normalizeInvoiceData({
            items: [{ mnozstvi: 1, cenaZaMj: 10 }],
            signature: 'not-a-data-url'
        });
        expect(withInvalidSignature.signature).toBeNull();

        const withoutSignature = normalizeInvoiceData({
            items: [{ mnozstvi: 1, cenaZaMj: 10 }]
        });
        expect(withoutSignature.signature).toBeNull();
    });
});
