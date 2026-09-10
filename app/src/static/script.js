const addItemButton = document.getElementById("addItemButton");
const itemsContainer = document.getElementById("itemsContainer");
const printInvoiceButton = document.getElementById("printInvoiceButton");
const saveInvoiceButton = document.getElementById("saveInvoiceButton");
const invoiceSaveStatus = document.getElementById("invoiceSaveStatus");
const invoiceNumberDisplay = document.getElementById("invoiceNumberDisplay");
const invoiceList = document.getElementById("invoiceList");
const invoiceListScreen = document.getElementById("invoice-list-screen");
const invoiceEditorScreen = document.getElementById("invoice-editor-screen");
const invoiceListNavButton = document.getElementById("invoiceListNavButton");
const newInvoiceButton = document.getElementById("newInvoiceButton");
const exportInvoicesButton = document.getElementById("exportInvoicesButton");
const deleteAllInvoicesButton = document.getElementById("deleteAllInvoicesButton");
const currentViewLabel = document.getElementById("currentViewLabel");
const saveSupplierButton = document.getElementById("saveSupplierButton");
const loadSupplierButton = document.getElementById("loadSupplierButton");
const supplierSaveStatus = document.getElementById("supplierSaveStatus");
const clientSelect = document.getElementById("clientSelect");
const clientTypeSelect = document.getElementById("odberatelTypSubjektu");
const personFields = document.getElementById("personFields");
const companyFields = document.getElementById("companyFields");
const supplierTypeSelect = document.getElementById("dodavatelTypSubjektu");
const supplierPersonFields = document.getElementById("supplierPersonFields");
const supplierCompanyFields = document.getElementById("supplierCompanyFields");
const saveClientButton = document.getElementById("saveClientButton");
const deleteClientButton = document.getElementById("deleteClientButton");
const authScreen = document.getElementById("auth-screen");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmitButton = document.getElementById("authSubmitButton");
const authModeButton = document.getElementById("authModeButton");
const forgotPasswordButton = document.getElementById("forgotPasswordButton");
const authStatus = document.getElementById("authStatus");
const logoutButton = document.getElementById("logoutButton");
const signedInEmail = document.getElementById("navEmail");
const passwordButton = document.getElementById("passwordButton");
const passwordPanel = document.getElementById("passwordPanel");
const passwordForm = document.getElementById("passwordForm");
const savePasswordButton = document.getElementById("savePasswordButton");
const cancelPasswordButton = document.getElementById("cancelPasswordButton");
const passwordStatus = document.getElementById("passwordStatus");
const dueDateOption = document.getElementById("dueDateOption");
const dueDateDisplay = document.getElementById("dueDateDisplay");
const paymentPresetSelect = document.getElementById("paymentPresetSelect");
const paymentPresetName = document.getElementById("paymentPresetName");
const savePaymentPresetButton = document.getElementById("savePaymentPresetButton");
const loadPaymentPresetButton = document.getElementById("loadPaymentPresetButton");
const deletePaymentPresetButton = document.getElementById("deletePaymentPresetButton");

document.querySelectorAll(".nav-menu button").forEach((button) => {
    button.addEventListener("click", () => {
        button.closest("details").open = false;
    });
});

document.addEventListener("click", (event) => {
    document.querySelectorAll(".nav-menu[open]").forEach((menu) => {
        if (!menu.contains(event.target)) {
            menu.open = false;
        }
    });
});

let itemIndex = 0;
let clients = [];
let invoices = [];
let paymentPresets = [];
let currentInvoiceId = null;
let isRegistrationMode = false;

const profileFieldMap = {
    nazevSpolecnosti: "NazevSpolecnosti",
    ico: "Ico",
    jmeno: "Jmeno",
    prijmeni: "Prijmeni",
    uliceCp: "UliceCp",
    psc: "Psc",
    mesto: "Mesto"
};

const readProfileFields = (prefix) => Object.fromEntries(
    Object.entries(profileFieldMap).map(([key, suffix]) => [
        key,
        document.getElementById(`${prefix}${suffix}`).value.trim()
    ])
);

const writeProfileFields = (prefix, fields) => Object.entries(profileFieldMap).forEach(([key, suffix]) => {
    const field = document.getElementById(`${prefix}${suffix}`);
    if (field) {
        field.value = fields[key] || "";
    }
});

const writeFields = (fields) => Object.entries(fields).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) {
        field.value = value || "";
    }
});

const getClientLabel = (client) => [
    client.data.nazevSpolecnosti,
    [client.data.jmeno, client.data.prijmeni].filter(Boolean).join(" "),
    client.data.ico && `IČO: ${client.data.ico}`
].filter(Boolean).join(" ") || "Bez názvu";

const formatCzechDate = (dateValue) => new Date(`${dateValue}T00:00:00`).toLocaleDateString("cs-CZ");

const getDueDays = () => Number.parseInt(dueDateOption.value, 10) || 14;

const getDueDate = () => {
    const dueDate = new Date();
    dueDate.setHours(0, 0, 0, 0);
    dueDate.setDate(dueDate.getDate() + getDueDays());
    return dueDate.toISOString().slice(0, 10);
};

const updateDueDate = () => {
    dueDateDisplay.textContent = `Splatnost: ${formatCzechDate(getDueDate())}`;
};

const updateClientTypeFields = () => {
    const isCompany = clientTypeSelect.value === "spolecnost";
    personFields.hidden = isCompany;
    companyFields.hidden = !isCompany;
};

const updateSupplierTypeFields = () => {
    const isCompany = supplierTypeSelect.value === "spolecnost";
    supplierPersonFields.hidden = isCompany;
    supplierCompanyFields.hidden = !isCompany;
};

const apiRequest = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
        throw new Error(data?.error || "Požadavek se nepodařilo dokončit.");
    }
    return data;
};

const showInvoiceScreen = (screen) => {
    invoiceListScreen.hidden = screen !== "list";
    invoiceEditorScreen.hidden = screen !== "editor";
    currentViewLabel.textContent = screen === "list"
        ? "Seznam faktur"
        : (currentInvoiceId ? "Upravit fakturu" : "Nová faktura");
};

const renderPaymentPresetOptions = (selectedId = paymentPresetSelect.value) => {
    paymentPresetSelect.innerHTML = "<option value=\"\">Vyberte konfiguraci</option>";
    paymentPresets.forEach((preset) => {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.name;
        paymentPresetSelect.appendChild(option);
    });
    paymentPresetSelect.value = selectedId;
    deletePaymentPresetButton.disabled = !paymentPresetSelect.value;
};

const loadPaymentPresets = async () => {
    const response = await apiRequest("/api/payment-presets");
    paymentPresets = response.presets;
    renderPaymentPresetOptions();
};

paymentPresetSelect.addEventListener("change", () => {
    const preset = paymentPresets.find(({ id }) => String(id) === paymentPresetSelect.value);
    if (!preset) {
        deletePaymentPresetButton.disabled = true;
        return;
    }
    paymentPresetName.value = preset.name;
    deletePaymentPresetButton.disabled = false;
});

loadPaymentPresetButton.addEventListener("click", () => {
    const preset = paymentPresets.find(({ id }) => String(id) === paymentPresetSelect.value);
    if (!preset) {
        window.alert("Nejprve vyberte uložené platební údaje.");
        return;
    }
    document.getElementById("cisloUctu").value = preset.accountNumber;
    document.getElementById("iban").value = preset.iban;
    document.getElementById("swift").value = preset.swift;
});

savePaymentPresetButton.addEventListener("click", async () => {
    try {
        const response = await apiRequest("/api/payment-presets", {
            method: "POST",
            body: JSON.stringify({
                name: paymentPresetName.value,
                accountNumber: getValue("cisloUctu"),
                iban: getValue("iban"),
                swift: getValue("swift")
            })
        });
        const preset = response.preset;
        paymentPresets = [
            ...paymentPresets.filter((entry) => entry.id !== preset.id && entry.name !== preset.name),
            preset
        ].sort((left, right) => left.name.localeCompare(right.name));
        renderPaymentPresetOptions(String(preset.id));
        paymentPresetName.value = preset.name;
    } catch (error) {
        window.alert(error.message);
    }
});

deletePaymentPresetButton.addEventListener("click", async () => {
    if (!paymentPresetSelect.value) {
        return;
    }
    try {
        await apiRequest(`/api/payment-presets/${paymentPresetSelect.value}`, { method: "DELETE" });
        paymentPresets = paymentPresets.filter(({ id }) => String(id) !== paymentPresetSelect.value);
        paymentPresetName.value = "";
        renderPaymentPresetOptions();
    } catch (error) {
        window.alert(error.message);
    }
});

const readInvoiceData = () => ({
    supplier: {
        ...readProfileFields("dodavatel"),
        typSubjektu: supplierTypeSelect.value
    },
    customer: {
        ...readProfileFields("odberatel"),
        typSubjektu: clientTypeSelect.value
    },
    payment: {
        cisloUctu: getValue("cisloUctu"),
        iban: getValue("iban"),
        swift: getValue("swift")
    },
    total: Number.parseFloat(getValue("total").replace(",", ".")) || 0,
    items: Array.from(itemsContainer.querySelectorAll(".invoice-item")).map((item) => {
        const inputs = item.querySelectorAll("input");
        return {
            popis: inputs[0].value.trim(),
            mnozstvi: Number(inputs[1].value) || 0,
            mernaJednotka: inputs[2].value.trim(),
            cenaZaMj: Number(inputs[3].value) || 0
        };
    })
});

const clearInvoiceEditor = () => {
    currentInvoiceId = null;
    invoiceNumberDisplay.textContent = "Nová faktura";
    invoiceSaveStatus.textContent = "";
    writeProfileFields("odberatel", {});
    clientSelect.value = "";
    clientTypeSelect.value = "osoba";
    updateClientTypeFields();
    paymentPresetSelect.value = "";
    paymentPresetName.value = "";
    deletePaymentPresetButton.disabled = true;
    ["cisloUctu", "iban", "swift"].forEach((id) => {
        document.getElementById(id).value = "";
    });
    itemsContainer.replaceChildren();
    itemIndex = 0;
    updateTotal();
};

const loadInvoiceIntoEditor = (invoice) => {
    currentInvoiceId = invoice.id;
    invoiceNumberDisplay.textContent = invoice.invoiceNumber;
    invoiceSaveStatus.textContent = "";
    writeProfileFields("dodavatel", invoice.data.supplier || {});
    supplierTypeSelect.value = invoice.data.supplier?.typSubjektu || "osoba";
    updateSupplierTypeFields();
    writeProfileFields("odberatel", invoice.data.customer || {});
    clientTypeSelect.value = invoice.data.customer?.typSubjektu || "osoba";
    updateClientTypeFields();
    paymentPresetSelect.value = "";
    paymentPresetName.value = "";
    deletePaymentPresetButton.disabled = true;
    ["cisloUctu", "iban", "swift"].forEach((id) => {
        document.getElementById(id).value = invoice.data.payment?.[id] || "";
    });
    itemsContainer.replaceChildren();
    itemIndex = 0;
    (invoice.data.items || []).forEach((item) => addInvoiceItem(item));
    updateTotal();
    showInvoiceScreen("editor");
};

const getInvoiceLabel = (invoice) => {
    const customer = invoice.data.customer || {};
    return customer.typSubjektu === "spolecnost"
        ? customer.nazevSpolecnosti || "Bez odběratele"
        : [customer.jmeno, customer.prijmeni].filter(Boolean).join(" ") || "Bez odběratele";
};

const renderInvoiceList = () => {
    if (!invoices.length) {
        invoiceList.innerHTML = "<p class=\"empty-list\">Zatím nemáte uložené žádné faktury.</p>";
        return;
    }
    invoiceList.innerHTML = invoices.map((invoice) => `
        <article class="invoice-list-row">
            <button type="button" class="invoice-open-button" data-invoice-id="${invoice.id}">
                <strong>${escapeHtml(invoice.invoiceNumber)}</strong>
                <span>${escapeHtml(getInvoiceLabel(invoice))}</span>
                <small>${new Date(invoice.updatedAt).toLocaleDateString("cs-CZ")}</small>
            </button>
            <button type="button" class="invoice-delete-button" data-delete-invoice-id="${invoice.id}">Smazat</button>
        </article>
    `).join("");
};

const loadInvoices = async () => {
    const response = await apiRequest("/api/invoices");
    invoices = response.invoices;
    renderInvoiceList();
};

const openNewInvoice = () => {
    clearInvoiceEditor();
    showInvoiceScreen("editor");
};

const saveInvoice = async () => {
    try {
        const response = await apiRequest(currentInvoiceId ? `/api/invoices/${currentInvoiceId}` : "/api/invoices", {
            method: currentInvoiceId ? "PUT" : "POST",
            body: JSON.stringify({ data: readInvoiceData() })
        });
        const invoice = response.invoice;
        currentInvoiceId = invoice.id;
        invoiceNumberDisplay.textContent = invoice.invoiceNumber;
        invoiceSaveStatus.textContent = "Faktura uložena";
        await loadInvoices();
        showInvoiceScreen("list");
    } catch (error) {
        invoiceSaveStatus.textContent = error.message;
    }
};

invoiceListNavButton.addEventListener("click", async () => {
    await loadInvoices();
    showInvoiceScreen("list");
});

newInvoiceButton.addEventListener("click", openNewInvoice);
exportInvoicesButton.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/invoices/export", { credentials: "same-origin" });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Export se nepodařil.");
        }
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "faktury.zip";
        link.click();
        URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        window.alert(error.message);
    }
});
saveInvoiceButton.addEventListener("click", saveInvoice);
deleteAllInvoicesButton.addEventListener("click", async () => {
    if (!invoices.length || !window.confirm("Opravdu chcete smazat všechny faktury a začít číslovat znovu od 0001?")) {
        return;
    }
    try {
        await apiRequest("/api/invoices", { method: "DELETE" });
        invoices = [];
        renderInvoiceList();
        clearInvoiceEditor();
        showInvoiceScreen("list");
    } catch (error) {
        window.alert(error.message);
    }
});

invoiceList.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-invoice-id]");
    const deleteButton = event.target.closest("[data-delete-invoice-id]");
    if (deleteButton) {
        if (!window.confirm("Opravdu chcete tuto fakturu smazat?")) {
            return;
        }
        await apiRequest(`/api/invoices/${deleteButton.dataset.deleteInvoiceId}`, { method: "DELETE" });
        await loadInvoices();
        return;
    }
    if (openButton) {
        const invoice = invoices.find(({ id }) => String(id) === openButton.dataset.invoiceId);
        if (invoice) {
            loadInvoiceIntoEditor(invoice);
        }
    }
});

const saveSupplier = async () => {
    try {
        const data = readProfileFields("dodavatel");
        data.typSubjektu = supplierTypeSelect.value;
        await apiRequest("/api/supplier", {
            method: "PUT",
            body: JSON.stringify(data)
        });
        supplierSaveStatus.textContent = "Uloženo na serveru";
    } catch (error) {
        supplierSaveStatus.textContent = error.message;
    }
};

const loadSupplier = async () => {
    const { supplier } = await apiRequest("/api/supplier");
    if (supplier) {
        writeProfileFields("dodavatel", supplier);
        supplierTypeSelect.value = supplier.typSubjektu || (supplier.nazevSpolecnosti ? "spolecnost" : "osoba");
        updateSupplierTypeFields();
        supplierSaveStatus.textContent = "Uloženo na serveru";
        return true;
    }
    supplierSaveStatus.textContent = "Zatím není uložený dodavatel";
    return false;
};

const renderClientOptions = (selectedId = clientSelect.value) => {
    clientSelect.innerHTML = "<option value=\"\">Vyberte odběratele</option>";

    clients.forEach((client) => {
        const option = document.createElement("option");
        option.value = client.id;
        option.textContent = getClientLabel(client);
        clientSelect.appendChild(option);
    });

    clientSelect.value = selectedId;
    deleteClientButton.disabled = !clientSelect.value;
};

const loadClients = async () => {
    const response = await apiRequest("/api/clients");
    clients = response.clients;
    renderClientOptions();
};

const loadSelectedClient = () => {
    const client = clients.find(({ id }) => String(id) === clientSelect.value);
    if (client) {
        writeProfileFields("odberatel", client.data);
        clientTypeSelect.value = client.typSubjektu || (client.data.nazevSpolecnosti ? "spolecnost" : "osoba");
        updateClientTypeFields();
    }
    deleteClientButton.disabled = !client;
};

saveSupplierButton.addEventListener("click", saveSupplier);
supplierTypeSelect.addEventListener("change", updateSupplierTypeFields);
loadSupplierButton.addEventListener("click", async () => {
    try {
        await loadSupplier();
        supplierSaveStatus.textContent = "Dodavatel načten";
    } catch (error) {
        supplierSaveStatus.textContent = error.message;
    }
});
clientTypeSelect.addEventListener("change", updateClientTypeFields);

clientSelect.addEventListener("change", loadSelectedClient);

saveClientButton.addEventListener("click", async () => {
    const data = readProfileFields("odberatel");
    data.typSubjektu = clientTypeSelect.value;
    const existingClient = clients.find((client) => String(client.id) === clientSelect.value);
    try {
        const response = await apiRequest(existingClient ? `/api/clients/${existingClient.id}` : "/api/clients", {
            method: existingClient ? "PUT" : "POST",
            body: JSON.stringify(data)
        });
        const client = response.client;
        clients = existingClient
            ? clients.map((entry) => entry.id === client.id ? client : entry)
            : [...clients, client];
        renderClientOptions(String(client.id));
    } catch (error) {
        window.alert(error.message);
    }
});

deleteClientButton.addEventListener("click", async () => {
    if (!clientSelect.value) {
        return;
    }

    try {
        await apiRequest(`/api/clients/${clientSelect.value}`, { method: "DELETE" });
        clients = clients.filter(({ id }) => String(id) !== clientSelect.value);
        renderClientOptions();
    } catch (error) {
        window.alert(error.message);
    }
});

const showInvoiceApp = async () => {
    authScreen.hidden = true;
    document.getElementById("main-container").hidden = false;
    await Promise.all([loadSupplier(), loadClients(), loadInvoices(), loadPaymentPresets()]);
    showInvoiceScreen("list");
};

const showPasswordPanel = (visible) => {
    passwordPanel.hidden = !visible;
    if (!visible) {
        passwordForm.querySelectorAll("input").forEach((input) => {
            input.value = "";
        });
        passwordStatus.textContent = "";
    }
};

const setAuthMode = (registrationMode) => {
    isRegistrationMode = registrationMode;
    authSubmitButton.textContent = registrationMode ? "Vytvořit účet" : "Přihlásit se";
    authModeButton.textContent = registrationMode
        ? "Máte účet? Přihlásit se"
        : "Nemáte účet? Zaregistrovat se";
    authPassword.autocomplete = registrationMode ? "new-password" : "current-password";
    authStatus.textContent = "";
};

authModeButton.addEventListener("click", () => setAuthMode(!isRegistrationMode));

forgotPasswordButton.addEventListener("click", () => {
    authStatus.textContent = "Obnova hesla e-mailem zatím není nakonfigurovaná. Přihlaste se a použijte Změnit heslo, nebo kontaktujte správce aplikace.";
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authStatus.textContent = "";
    authSubmitButton.disabled = true;
    try {
        const { user } = await apiRequest(isRegistrationMode ? "/api/auth/register" : "/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: authEmail.value, password: authPassword.value })
        });
        signedInEmail.textContent = user.email;
        await showInvoiceApp();
    } catch (error) {
        authStatus.textContent = error.message;
    } finally {
        authSubmitButton.disabled = false;
    }
});

logoutButton.addEventListener("click", async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    window.location.reload();
});

passwordButton.addEventListener("click", () => showPasswordPanel(passwordPanel.hidden));
cancelPasswordButton.addEventListener("click", () => showPasswordPanel(false));

savePasswordButton.addEventListener("click", async () => {
    passwordStatus.textContent = "";
    try {
        await apiRequest("/api/auth/password", {
            method: "POST",
            body: JSON.stringify({
                currentPassword: document.getElementById("currentPassword").value,
                newPassword: document.getElementById("newPassword").value
            })
        });
        passwordForm.querySelectorAll("input").forEach((input) => {
            input.value = "";
        });
        passwordStatus.textContent = "Heslo bylo změněno";
    } catch (error) {
        passwordStatus.textContent = error.message;
    }
});

(async () => {
    try {
        const { user } = await apiRequest("/api/auth/me");
        signedInEmail.textContent = user.email;
        await showInvoiceApp();
    } catch {
        authScreen.hidden = false;
        document.getElementById("main-container").hidden = true;
    }
})();

const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getValue = (id) => {
    const field = document.getElementById(id);
    if (!field) {
        return "";
    }
    return ("value" in field ? field.value : field.textContent).trim();
};

const formatCzechNumber = (value) => Number(value || 0).toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const getTotalValue = () => Number.parseFloat(getValue("total").replace(",", ".")) || 0;

const updateTotal = () => {
    const total = Array.from(itemsContainer.querySelectorAll(".invoice-item"))
        .reduce((sum, item) => {
            const quantity = Number(item.querySelector('[name$="[mnozstvi]"]').value) || 0;
            const unitPrice = Number(item.querySelector('[name$="[cenaZaMj]"]').value) || 0;
            return sum + quantity * unitPrice;
        }, 0);

    document.getElementById("total").textContent = `${formatCzechNumber(total)} Kč`;
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
    ((prefix === "odberatel" && getValue("odberatelTypSubjektu") === "spolecnost")
        || (prefix === "dodavatel" && getValue("dodavatelTypSubjektu") === "spolecnost"))
        ? getValue(`${prefix}NazevSpolecnosti`)
        : getPersonName(prefix),
    getValue(`${prefix}Ico`) ? `IČO: ${getValue(`${prefix}Ico`)}` : "",
    getAddress(prefix)
].filter(Boolean).map(escapeHtml).join("<br>");

const renderItems = () => Array.from(itemsContainer.querySelectorAll(".invoice-item"))
    .map((item) => {
        const values = Array.from(item.querySelectorAll("input")).map((input) => input.value.trim());
        return `<tr class="invoice-row">
            <td>${escapeHtml(values[0])}</td>
            <td>${escapeHtml(values[1] ? formatCzechNumber(values[1]) : "0,00")}</td>
            <td>${escapeHtml(values[2])}</td>
            <td>${escapeHtml(values[3] ? formatCzechNumber(values[3]) : "0,00")} Kč</td>
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

const buildPaymentQrPayload = (accountNumber, iban, swift, total, invoiceNumber = "") => {
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
        invoiceNumber && `X-VS:${invoiceNumber.replace(/\D/g, "").slice(-10)}`,
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
        Number.parseFloat(getValue("total").replace(",", ".")) || 0,
        invoiceNumberDisplay.textContent
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
    <h1>Faktura ${escapeHtml(invoiceNumberDisplay.textContent)}</h1>
    <div class="parties">
        <section class="party"><h2>Dodavatel</h2>${renderPerson("dodavatel") || "Neuvedeno"}</section>
        <section class="party"><h2>Odběratel</h2>${renderPerson("odberatel") || "Neuvedeno"}</section>
    </div>
    <table>
        <thead><tr><th>Položka</th><th>Množství</th><th>MJ</th><th>Cena za MJ</th></tr></thead>
        <tbody>${renderItems() || "<tr><td colspan=\"4\">Žádné položky</td></tr>"}</tbody>
    </table>
    <p class="total">Celková částka: ${formatCzechNumber(getTotalValue())} Kč</p>
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

const addInvoiceItem = (values = {}) => {
    itemIndex++;

    const item = document.createElement("div");
    item.classList.add("invoice-item");

    item.innerHTML = `
        <div class="form-group">
            <label for="polozka${itemIndex}Popis">Položka</label>
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

    const inputs = item.querySelectorAll("input");
    inputs[0].value = values.popis || "";
    inputs[1].value = values.mnozstvi ?? "";
    inputs[2].value = values.mernaJednotka || "";
    inputs[3].value = values.cenaZaMj ?? "";

    const deleteButton = item.querySelector(".delete-item-button");

    deleteButton.addEventListener("click", () => {
        item.remove();
        updateTotal();
    });

    itemsContainer.appendChild(item);
    updateTotal();
};

addItemButton.addEventListener("click", () => addInvoiceItem());

itemsContainer.addEventListener("input", updateTotal);

updateClientTypeFields();
updateSupplierTypeFields();
