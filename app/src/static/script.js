const addItemButton = document.getElementById("addItemButton");
const itemsContainer = document.getElementById("itemsContainer");
const printInvoiceButton = document.getElementById("printInvoiceButton");

let itemIndex = 0;

const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getValue = (id) => {
    const field = document.getElementById(id);
    return ("value" in field ? field.value : field.textContent).trim();
};

const updateTotal = () => {
    const total = Array.from(itemsContainer.querySelectorAll(".invoice-item"))
        .reduce((sum, item) => {
            const quantity = Number(item.querySelector('[name$="[mnozstvi]"]').value) || 0;
            const unitPrice = Number(item.querySelector('[name$="[cenaZaMj]"]').value) || 0;
            return sum + quantity * unitPrice;
        }, 0);

    document.getElementById("total").textContent = total.toFixed(2);
};

const getPersonName = (prefix) => [
    getValue(`${prefix}Jmeno`),
    getValue(`${prefix}Prijmeni`)
].filter(Boolean).join(" ");

const getAddress = (prefix) => [
    getValue(`${prefix}UliceCp`),
    [getValue(`${prefix}Psc`), getValue(`${prefix}Mesto`)].filter(Boolean).join(" ")
].filter(Boolean).join(", ");

const renderPerson = (prefix) => [
    getPersonName(prefix),
    getValue(`${prefix}Ico`) ? `IČO: ${getValue(`${prefix}Ico`)}` : "",
    getAddress(prefix)
].filter(Boolean).map(escapeHtml).join("<br>");

const renderItems = () => Array.from(itemsContainer.querySelectorAll(".invoice-item"))
    .map((item) => {
        const values = Array.from(item.querySelectorAll("input")).map((input) => input.value.trim());
        return `<tr class="invoice-row">
            <td>${escapeHtml(values[0])}</td>
            <td>${escapeHtml(values[1])}</td>
            <td>${escapeHtml(values[2])}</td>
            <td>${escapeHtml(values[3])}</td>
        </tr>`;
    }).join("");

const normalizeIban = (value) => value.replace(/\s+/g, "").toUpperCase();

const domesticAccountToIban = (accountNumber) => {
    const match = accountNumber.replace(/\s+/g, "")
        .match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);

    if (!match) {
        return "";
    }

    const bban = `${match[3]}${(match[1] || "").padStart(6, "0")}${match[2].padStart(10, "0")}`;
    const remainder = `${bban}123500`.split("").reduce(
        (value, digit) => (value * 10 + Number(digit)) % 97,
        0
    );
    const checkDigits = String(98 - remainder).padStart(2, "0");

    return `CZ${checkDigits}${bban}`;
};

const buildPaymentQrPayload = (accountNumber, iban, swift, total) => {
    const preferredAccount = normalizeIban(accountNumber);
    const fallbackAccount = normalizeIban(iban);
    const paymentAccount = /^([A-Z]{2})\d{2}[A-Z0-9]{10,32}$/.test(preferredAccount)
        ? preferredAccount
        : domesticAccountToIban(accountNumber) || fallbackAccount;

    if (!/^([A-Z]{2})\d{2}[A-Z0-9]{10,32}$/.test(paymentAccount)) {
        return "";
    }

    return [
        "SPD*1.0",
        `ACC:${paymentAccount}`,
        `AM:${Number(total || 0).toFixed(2)}`,
        "CC:CZK",
        swift && `X-SWIFT:${normalizeIban(swift)}`
    ].filter(Boolean).join("*");
};

const buildInvoiceHtml = () => {
    const accountNumber = getValue("cisloUctu");
    const iban = getValue("iban");
    const swift = getValue("swift");
    const qrPayload = buildPaymentQrPayload(
        accountNumber,
        iban,
        swift,
        getValue("total")
    );
    const qrMarkup = qrPayload
        ? `<img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&amp;data=${encodeURIComponent(qrPayload)}" alt="QR kód platebních údajů">`
        : "<p>Platební QR kód vyžaduje platný IBAN. Číslo účtu bez IBANu nelze bezpečně převést.</p>";
    const paymentDetails = [
        accountNumber && `Číslo účtu: ${accountNumber}`,
        iban && `IBAN: ${iban}`,
        swift && `SWIFT: ${swift}`
    ].filter(Boolean).map(escapeHtml).join("<br>");

    return `<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <title>Faktura</title>
    <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body { color: #202124; font: 14px Arial, sans-serif; margin: 0; }
        h1 { font-size: 30px; margin: 0 0 28px; }
        h2 { font-size: 16px; margin: 0 0 8px; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 28px; }
        .party, .payment { border-top: 2px solid #202124; padding-top: 10px; }
        table { border-collapse: separate; border-spacing: 0; margin-top: 24px; width: 100%; }
        th, td { padding: 9px 6px; text-align: left; }
        th { background: #f1f1f1; border-bottom: 1px solid #aeb8c0; }
        .invoice-row td { border-bottom: 1px solid #c8c8c8; }
        .invoice-row:nth-child(even) { background: #f4f7fb; }
        .total { font-size: 18px; font-weight: bold; margin-top: 22px; text-align: right; }
        .payment-row { align-items: start; display: flex; gap: 28px; justify-content: space-between; margin-top: 36px; }
        .qr-code { height: 180px; width: 180px; }
        .qr-placeholder { color: #666; max-width: 220px; }
        @media print { .qr-placeholder { color: #202124; } }
    </style>
</head>
<body>
    <h1>Faktura</h1>
    <div class="parties">
        <section class="party"><h2>Dodavatel</h2>${renderPerson("dodavatel") || "Neuvedeno"}</section>
        <section class="party"><h2>Odběratel</h2>${renderPerson("odberatel") || "Neuvedeno"}</section>
    </div>
    <table>
        <thead><tr><th>Popis</th><th>Množství</th><th>MJ</th><th>Cena za MJ</th></tr></thead>
        <tbody>${renderItems() || "<tr><td colspan=\"4\">Žádné položky</td></tr>"}</tbody>
    </table>
    <p class="total">Celková částka: ${escapeHtml(getValue("total")) || "0"}</p>
    <div class="payment-row">
        <section class="payment"><h2>Platební údaje</h2>${paymentDetails || "Neuvedeno"}</section>
        <div class="qr-placeholder">${qrMarkup}</div>
    </div>
</body>
</html>`;
};

printInvoiceButton.addEventListener("click", () => {
    const printWindow = window.open("about:blank", "_blank");

    if (!printWindow) {
        window.alert("Povolte prosím vyskakovací okna pro tisk faktury.");
        return;
    }

    printWindow.document.open();
    printWindow.document.write(buildInvoiceHtml());
    printWindow.document.close();
    printWindow.addEventListener("load", () => printWindow.print(), { once: true });
});

addItemButton.addEventListener("click", () => {
    itemIndex++;

    const item = document.createElement("div");
    item.classList.add("invoice-item");

    item.innerHTML = `
        <div class="form-group">
            <label for="polozka${itemIndex}Popis">Popis</label>
            <input
                id="polozka${itemIndex}Popis"
                name="polozky[${itemIndex}][popis]"
                type="text"
            />
        </div>

        <div class="form-group">
            <label for="polozka${itemIndex}Mnozstvi">Množství</label>
            <input
                id="polozka${itemIndex}Mnozstvi"
                name="polozky[${itemIndex}][mnozstvi]"
                type="number"
                min="0"
                step="0.01"
            />
        </div>

        <div class="form-group">
            <label for="polozka${itemIndex}MernaJednotka">
                Měrná jednotka
            </label>
            <input
                id="polozka${itemIndex}MernaJednotka"
                name="polozky[${itemIndex}][mernaJednotka]"
                type="text"
                placeholder="ks"
            />
        </div>

        <div class="form-group">
            <label for="polozka${itemIndex}CenaZaMj">
                Cena za MJ
            </label>
            <input
                id="polozka${itemIndex}CenaZaMj"
                name="polozky[${itemIndex}][cenaZaMj]"
                type="number"
                min="0"
                step="0.01"
            />
        </div>

        <button
            type="button"
            class="delete-item-button"
            aria-label="Smazat položku"
            title="Smazat položku"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M3 6h18"></path>
                <path d="M8 6V4h8v2"></path>
                <path d="M19 6l-1 14H6L5 6"></path>
                <path d="M10 11v5"></path>
                <path d="M14 11v5"></path>
            </svg>
        </button>
    `;

    const deleteButton = item.querySelector(".delete-item-button");

    deleteButton.addEventListener("click", () => {
        item.remove();
        updateTotal();
    });

    itemsContainer.appendChild(item);
    updateTotal();
});

itemsContainer.addEventListener("input", updateTotal);
