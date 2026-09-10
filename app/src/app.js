const express = require('express');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { pool, initializeDatabase } = require('./db');
const { normalizeInvoiceData } = require('./invoice-data');

const app = express();
const sessionDurationMs = 1000 * 60 * 60 * 24 * 30;

app.use(express.json());

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
        if (error) {
            reject(error);
            return;
        }
        resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
});

const verifyPassword = async (password, storedHash) => {
    const [salt, expectedHex] = storedHash.split(':');
    const actualHash = await hashPassword(password, salt);
    const actualBuffer = Buffer.from(actualHash.split(':')[1], 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const getSessionToken = (req) => {
    const cookie = req.headers.cookie || '';
    const sessionCookie = cookie.split(';').map((part) => part.trim())
        .find((part) => part.startsWith('fakturovac_session='));
    return sessionCookie ? decodeURIComponent(sessionCookie.split('=').slice(1).join('=')) : '';
};

const setSessionCookie = (res, token) => {
    const secure = process.env.SESSION_COOKIE_SECURE === 'true' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `fakturovac_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDurationMs / 1000}${secure}`);
};

const clearSessionCookie = (res) => {
    const secure = process.env.SESSION_COOKIE_SECURE === 'true' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `fakturovac_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
};

const createSession = async (userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')',
        [token, userId]
    );
    return token;
};

const requireAuth = async (req, res, next) => {
    try {
        await initializeDatabase();
        const token = getSessionToken(req);
        if (!token) {
            res.status(401).json({ error: 'Nejste přihlášeni.' });
            return;
        }

        const result = await pool.query(
            'SELECT user_id FROM sessions WHERE id = $1 AND expires_at > NOW()',
            [token]
        );
        if (!result.rowCount) {
            clearSessionCookie(res);
            res.status(401).json({ error: 'Relace vypršela.' });
            return;
        }

        req.userId = result.rows[0].user_id;
        next();
    } catch (error) {
        next(error);
    }
};

const validateCredentials = (email, password) => typeof email === 'string'
    && email.includes('@')
    && typeof password === 'string'
    && password.length >= 8;

const profileFields = ['nazevSpolecnosti', 'ico', 'jmeno', 'prijmeni', 'uliceCp', 'psc', 'mesto'];
const profileValues = (body) => profileFields.map((field) => typeof body[field] === 'string' ? body[field].trim() : '');
const profileResponse = (row) => ({
    typSubjektu: row.typ_subjektu === 'spolecnost' ? 'spolecnost' : 'osoba',
    nazevSpolecnosti: row.nazev_spolecnosti,
    ico: row.ico,
    jmeno: row.jmeno,
    prijmeni: row.prijmeni,
    uliceCp: row.ulice_cp,
    psc: row.psc,
    mesto: row.mesto
});

const clientResponse = (row) => ({
    id: row.id,
    typSubjektu: row.typ_subjektu === 'spolecnost' ? 'spolecnost' : 'osoba',
    data: profileResponse(row)
});


app.post('/api/auth/register', async (req, res, next) => {
    try {
        await initializeDatabase();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = req.body.password;
        if (!validateCredentials(email, password)) {
            res.status(400).json({ error: 'Zadejte platný e-mail a heslo dlouhé alespoň 8 znaků.' });
            return;
        }

        const passwordHash = await hashPassword(password);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email, passwordHash]
        );
        const token = await createSession(result.rows[0].id);
        setSessionCookie(res, token);
        res.status(201).json({ user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Účet s tímto e-mailem už existuje.' });
            return;
        }
        next(error);
    }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        await initializeDatabase();
        const email = String(req.body.email || '').trim().toLowerCase();
        const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
        if (!result.rowCount || !(await verifyPassword(req.body.password || '', result.rows[0].password_hash))) {
            res.status(401).json({ error: 'E-mail nebo heslo není správně.' });
            return;
        }

        const token = await createSession(result.rows[0].id);
        setSessionCookie(res, token);
        res.json({ user: { id: result.rows[0].id, email: result.rows[0].email } });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/logout', async (req, res, next) => {
    try {
        await initializeDatabase();
        const token = getSessionToken(req);
        if (token) {
            await pool.query('DELETE FROM sessions WHERE id = $1', [token]);
        }
        clearSessionCookie(res);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.userId]);
        res.json({ user: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/password', requireAuth, async (req, res, next) => {
    try {
        const currentPassword = req.body.currentPassword || '';
        const newPassword = req.body.newPassword || '';
        const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
        if (!result.rowCount || !(await verifyPassword(currentPassword, result.rows[0].password_hash))) {
            res.status(400).json({ error: 'Současné heslo není správně.' });
            return;
        }
        if (!validateCredentials('account@example.com', newPassword)) {
            res.status(400).json({ error: 'Nové heslo musí mít alespoň 8 znaků.' });
            return;
        }

        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.userId]);
        await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.userId, getSessionToken(req)]);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.get('/api/supplier', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM supplier_profiles WHERE user_id = $1', [req.userId]);
        res.json({ supplier: result.rowCount ? profileResponse(result.rows[0]) : null });
    } catch (error) {
        next(error);
    }
});

app.put('/api/supplier', requireAuth, async (req, res, next) => {
    try {
        const values = profileValues(req.body);
        const type = req.body.typSubjektu === 'spolecnost' ? 'spolecnost' : 'osoba';
        const result = await pool.query(`
            INSERT INTO supplier_profiles (user_id, typ_subjektu, nazev_spolecnosti, ico, jmeno, prijmeni, ulice_cp, psc, mesto)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (user_id) DO UPDATE SET
                    typ_subjektu = EXCLUDED.typ_subjektu, nazev_spolecnosti = EXCLUDED.nazev_spolecnosti,
                    ico = EXCLUDED.ico,
                    jmeno = EXCLUDED.jmeno, prijmeni = EXCLUDED.prijmeni,
                    ulice_cp = EXCLUDED.ulice_cp, psc = EXCLUDED.psc, mesto = EXCLUDED.mesto
            RETURNING *
            `, [req.userId, type, ...values]);
        res.json({ supplier: profileResponse(result.rows[0]) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/settings', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query('SELECT invoice_starting_number FROM user_settings WHERE user_id = $1', [req.userId]);
        res.json({ settings: { invoiceStartingNumber: result.rowCount ? result.rows[0].invoice_starting_number : 1 } });
    } catch (error) {
        next(error);
    }
});

app.put('/api/settings', requireAuth, async (req, res, next) => {
    try {
        const invoiceStartingNumber = Number.parseInt(req.body.invoiceStartingNumber, 10);
        if (!Number.isInteger(invoiceStartingNumber) || invoiceStartingNumber < 1) {
            res.status(400).json({ error: 'Počáteční číslo faktury musí být kladné celé číslo.' });
            return;
        }
        const result = await pool.query(`
            INSERT INTO user_settings (user_id, invoice_starting_number) VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET invoice_starting_number = EXCLUDED.invoice_starting_number
            RETURNING invoice_starting_number
            `, [req.userId, invoiceStartingNumber]);
        res.json({ settings: { invoiceStartingNumber: result.rows[0].invoice_starting_number } });
    } catch (error) {
        next(error);
    }
});

app.get('/api/clients', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at, id', [req.userId]);
        res.json({ clients: result.rows.map(clientResponse) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/clients', requireAuth, async (req, res, next) => {
    try {
        const values = profileValues(req.body);
        const type = req.body.typSubjektu === 'spolecnost' ? 'spolecnost' : 'osoba';
        const result = await pool.query(`
            INSERT INTO clients (user_id, typ_subjektu, nazev_spolecnosti, ico, jmeno, prijmeni, ulice_cp, psc, mesto)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [req.userId, type, ...values]);
        res.status(201).json({ client: clientResponse(result.rows[0]) });
    } catch (error) {
        next(error);
    }
});

app.put('/api/clients/:id', requireAuth, async (req, res, next) => {
    try {
        const values = profileValues(req.body);
        const type = req.body.typSubjektu === 'spolecnost' ? 'spolecnost' : 'osoba';
        const result = await pool.query(`
            UPDATE clients SET typ_subjektu = $1, nazev_spolecnosti = $2, ico = $3, jmeno = $4,
                prijmeni = $5, ulice_cp = $6, psc = $7, mesto = $8
            WHERE id = $9 AND user_id = $10 RETURNING *
        `, [type, ...values, req.params.id, req.userId]);
        if (!result.rowCount) {
            res.status(404).json({ error: 'Odběratel nebyl nalezen.' });
            return;
        }
        res.json({ client: clientResponse(result.rows[0]) });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/clients/:id', requireAuth, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

const paymentPresetResponse = (row) => ({
    id: row.id,
    name: row.name,
    accountNumber: row.account_number,
    iban: row.iban,
    swift: row.swift
});

app.get('/api/payment-presets', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM payment_presets WHERE user_id = $1 ORDER BY name',
            [req.userId]
        );
        res.json({ presets: result.rows.map(paymentPresetResponse) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/payment-presets', requireAuth, async (req, res, next) => {
    try {
        const name = String(req.body.name || '').trim();
        if (!name) {
            res.status(400).json({ error: 'Zadejte název platební konfigurace.' });
            return;
        }
        const result = await pool.query(`
            INSERT INTO payment_presets (user_id, name, account_number, iban, swift)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, name) DO UPDATE SET
                account_number = EXCLUDED.account_number,
                iban = EXCLUDED.iban,
                swift = EXCLUDED.swift
            RETURNING *
        `, [
            req.userId,
            name,
            String(req.body.accountNumber || '').trim(),
            String(req.body.iban || '').trim(),
            String(req.body.swift || '').trim()
        ]);
        res.status(201).json({ preset: paymentPresetResponse(result.rows[0]) });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/payment-presets/:id', requireAuth, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM payment_presets WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

const invoiceResponse = (row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    data: row.invoice_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

app.get('/api/invoices', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, invoice_number, invoice_data, created_at, updated_at FROM invoices WHERE user_id = $1 ORDER BY updated_at DESC, id DESC',
            [req.userId]
        );
        res.json({ invoices: result.rows.map(invoiceResponse) });
    } catch (error) {
        next(error);
    }
});

app.get('/health', async (req, res, next) => {
    try {
        await initializeDatabase();
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (error) {
        next(error);
    }
});

app.post('/api/invoices', requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
        const data = normalizeInvoiceData(req.body.data);
        if (!data) {
            res.status(400).json({ error: 'Neplatná data faktury.' });
            return;
        }

        const invoiceYear = new Date().getFullYear();
        await client.query('BEGIN');
        const settingsResult = await client.query(
            'SELECT invoice_starting_number FROM user_settings WHERE user_id = $1',
            [req.userId]
        );
        const invoiceStartingNumber = settingsResult.rowCount ? settingsResult.rows[0].invoice_starting_number : 1;
        await client.query(`
            INSERT INTO invoice_counters (user_id, invoice_year, last_number)
            SELECT $1, $2, GREATEST(
                COALESCE(MAX((substring(invoice_number FROM '^F-[0-9]{4}-([0-9]+)$'))::integer), 0),
                $4 - 1
            )
            FROM invoices
            WHERE user_id = $1 AND invoice_number LIKE $3
            ON CONFLICT (user_id, invoice_year) DO NOTHING
        `, [req.userId, invoiceYear, `F-${invoiceYear}-%`, invoiceStartingNumber]);
        const counterResult = await client.query(`
            UPDATE invoice_counters
            SET last_number = last_number + 1
            WHERE user_id = $1 AND invoice_year = $2
            RETURNING last_number
        `, [req.userId, invoiceYear]);
        const invoiceNumber = `F-${invoiceYear}-${String(counterResult.rows[0].last_number).padStart(4, '0')}`;
        const result = await client.query(
            'INSERT INTO invoices (user_id, invoice_number, invoice_data) VALUES ($1, $2, $3) RETURNING *',
            [req.userId, invoiceNumber, data]
        );
        await client.query('COMMIT');
        res.status(201).json({ invoice: invoiceResponse(result.rows[0]) });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

app.put('/api/invoices/:id', requireAuth, async (req, res, next) => {
    try {
        const data = normalizeInvoiceData(req.body.data);
        if (!data) {
            res.status(400).json({ error: 'Neplatná data faktury.' });
            return;
        }
        const result = await pool.query(
            'UPDATE invoices SET invoice_data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
            [data, req.params.id, req.userId]
        );
        if (!result.rowCount) {
            res.status(404).json({ error: 'Faktura nebyla nalezena.' });
            return;
        }
        res.json({ invoice: invoiceResponse(result.rows[0]) });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/invoices/:id', requireAuth, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.delete('/api/invoices', requireAuth, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM invoices WHERE user_id = $1', [req.userId]);
        await pool.query('DELETE FROM invoice_counters WHERE user_id = $1', [req.userId]);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

const pdfText = (value) => String(value || 'Neuvedeno');
const formatCzechNumber = (value) => Number(value || 0).toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const normalizeIban = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

const domesticAccountToIban = (accountNumber) => {
    const match = String(accountNumber || '').replace(/\s+/g, '')
        .match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
    if (!match) {
        return '';
    }
    const bban = `${match[3]}${(match[1] || '').padStart(6, '0')}${match[2].padStart(10, '0')}`;
    const remainder = `${bban}123500`.split('').reduce(
        (value, digit) => (value * 10 + Number(digit)) % 97,
        0
    );
    return `CZ${String(98 - remainder).padStart(2, '0')}${bban}`;
};

const buildPaymentQrPayload = (payment, total, invoiceNumber = '') => {
    const account = normalizeIban(payment.iban) || domesticAccountToIban(payment.cisloUctu);
    if (!/^([A-Z]{2})\d{2}[A-Z0-9]{10,32}$/.test(account)) {
        return '';
    }
    return [
        'SPD*1.0',
        `ACC:${account}`,
        `AM:${Number(total || 0).toFixed(2)}`,
        'CC:CZK',
        invoiceNumber && `X-VS:${invoiceNumber.replace(/\D/g, '').slice(-10)}`,
        payment.swift && `X-SWIFT:${normalizeIban(payment.swift)}`
    ].filter(Boolean).join('*');
};

const renderInvoicePdf = async (document, invoice) => {
    const data = invoice.invoice_data || {};
    const supplier = data.supplier || {};
    const customer = data.customer || {};
    const payment = data.payment || {};
    const supplierName = supplier.typSubjektu === 'spolecnost'
        ? supplier.nazevSpolecnosti
        : [supplier.jmeno, supplier.prijmeni].filter(Boolean).join(' ');
    const customerName = customer.typSubjektu === 'spolecnost'
        ? customer.nazevSpolecnosti
        : [customer.jmeno, customer.prijmeni].filter(Boolean).join(' ');
    const regularFont = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    const boldFont = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    const qrPayload = buildPaymentQrPayload(payment, data.total, invoice.invoice_number);
    const qrBuffer = qrPayload ? await QRCode.toBuffer(qrPayload, {
        type: 'png',
        width: 180,
        margin: 1
    }) : null;
    const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const navy = '#183b56';
    const line = '#d8d4cc';
    const lightBlue = '#f4f7fb';
    const warm = '#fffaf0';
    const bodyText = '#17202a';
    const address = (profile) => [
        profile.uliceCp,
        [profile.psc, profile.mesto].filter(Boolean).join(', ')
    ].filter(Boolean).join(', ');
    const identity = (profile, name) => [
        name || 'Neuvedeno',
        profile.ico ? `IČO: ${profile.ico}` : '',
        address(profile)
    ].filter(Boolean);
    const partyWidth = (pageWidth - 24) / 2;
    const customerX = document.page.margins.left + partyWidth + 24;

    const headerY = document.y;
    document.fillColor(navy).font(boldFont).fontSize(25).text('Faktura', document.page.margins.left, headerY);
    document.fillColor(navy).font(boldFont).fontSize(16).text(invoice.invoice_number, customerX, headerY, {
        width: partyWidth,
        align: 'right'
    });
    document.y = headerY + 40;

    const partyTop = document.y;
    const drawParty = (x, title, profile, name) => {
        const lines = identity(profile, name);
        document.roundedRect(x, partyTop, partyWidth, 86, 4).fillAndStroke('#f4f7fb', line);
        document.fillColor(navy).font(boldFont).fontSize(11).text(title, x + 10, partyTop + 10, { width: partyWidth - 20 });
        document.fillColor(bodyText).font(regularFont).fontSize(9).text(lines.join('\n'), x + 10, partyTop + 30, { width: partyWidth - 20, lineGap: 3 });
    };
    drawParty(document.page.margins.left, 'Dodavatel', supplier, supplierName);
    drawParty(customerX, 'Odběratel', customer, customerName);
    document.y = partyTop + 100;

    const tableTop = document.y + 12;
    const columns = [0, pageWidth * 0.52, pageWidth * 0.68, pageWidth * 0.82, pageWidth];
    const rowHeight = 25;
    document.rect(document.page.margins.left, tableTop, pageWidth, rowHeight).fill('#eef1f3');
    document.fillColor(navy).font(boldFont).fontSize(9);
    ['Položka', 'Množství', 'MJ', 'Cena za MJ'].forEach((heading, index) => {
        document.text(heading, document.page.margins.left + columns[index] + 6, tableTop + 8, {
            width: columns[index + 1] - columns[index] - 12
        });
    });
    document.y = tableTop + rowHeight;
    (data.items || []).forEach((item, index) => {
        const rowTop = document.y;
        document.rect(document.page.margins.left, rowTop, pageWidth, rowHeight)
            .fill(index % 2 ? lightBlue : warm);
        document.moveTo(document.page.margins.left, rowTop + rowHeight)
            .lineTo(document.page.margins.left + pageWidth, rowTop + rowHeight)
            .strokeColor(line).lineWidth(0.7).stroke();
        document.fillColor(bodyText).font(regularFont).fontSize(9);
        [pdfText(item.popis), formatCzechNumber(item.mnozstvi), pdfText(item.mernaJednotka), `${formatCzechNumber(item.cenaZaMj)} Kč`]
            .forEach((value, columnIndex) => document.text(value, document.page.margins.left + columns[columnIndex] + 6, rowTop + 8, {
                width: columns[columnIndex + 1] - columns[columnIndex] - 12
            }));
        document.y = rowTop + rowHeight;
    });

    document.y += 18;
    document.fillColor(navy).font(boldFont).fontSize(15)
        .text(`Celková částka: ${formatCzechNumber(data.total)} Kč`, document.page.margins.left, document.y, {
            width: pageWidth,
            align: 'right'
        });
    document.y += 35;
    document.moveTo(document.page.margins.left, document.y).lineTo(document.page.margins.left + pageWidth, document.y)
        .strokeColor(navy).lineWidth(1.5).stroke();
    document.y += 12;
    const paymentTop = document.y;
    document.roundedRect(document.page.margins.left, paymentTop, pageWidth, 165, 4).fillAndStroke('#f4f7fb', line);
    document.fillColor(navy).font(boldFont).fontSize(11).text('Platební údaje', document.page.margins.left + 10, paymentTop + 10);
    document.fillColor(bodyText).font(regularFont).fontSize(10)
        .text(`Číslo účtu: ${pdfText(payment.cisloUctu)}`, document.page.margins.left + 10, paymentTop + 35)
        .text(`IBAN: ${pdfText(payment.iban)}`, document.page.margins.left + 10, paymentTop + 55)
        .text(`SWIFT: ${pdfText(payment.swift)}`, document.page.margins.left + 10, paymentTop + 75);
    if (qrBuffer) {
        document.image(qrBuffer, document.page.margins.left + pageWidth - 155, paymentTop + 10, { width: 145, height: 145 });
    }
    document.end();
};

const appendInvoicePdf = async (archive, invoice) => {
    const document = new PDFDocument({ size: 'A4', margin: 50 });
    archive.append(document, { name: `${invoice.invoice_number}.pdf` });
    await renderInvoicePdf(document, invoice);
};

app.post('/api/invoices/pdf', requireAuth, async (req, res, next) => {
    try {
        const data = normalizeInvoiceData(req.body.data);
        if (!data) {
            res.status(400).json({ error: 'Neplatná data faktury.' });
            return;
        }

        const invoiceNumber = String(req.body.invoiceNumber || 'Nová faktura').trim() || 'Nová faktura';
        const document = new PDFDocument({ size: 'A4', margin: 50 });
        res.attachment(`${invoiceNumber}.pdf`);
        document.pipe(res);
        await renderInvoicePdf(document, { invoice_number: invoiceNumber, invoice_data: data });
    } catch (error) {
        next(error);
    }
});

app.get('/api/invoices/export', requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT invoice_number, invoice_data FROM invoices WHERE user_id = $1 ORDER BY invoice_number',
            [req.userId]
        );
        if (!result.rowCount) {
            res.status(404).json({ error: 'Nejsou uložené žádné faktury k exportu.' });
            return;
        }

        res.attachment('faktury.zip');
        const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
        archive.on('error', next);
        archive.pipe(res);
        for (const invoice of result.rows) {
            await appendInvoicePdf(archive, invoice);
        }
        archive.finalize();
    } catch (error) {
        next(error);
    }
});

// specifying the folder with the static content - html+css
app.use(express.static(__dirname + '/static'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/static/index.html'));
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Na serveru došlo k chybě.' });
});

module.exports = app;