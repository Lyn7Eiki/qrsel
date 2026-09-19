(() => {
  "use strict";

  const categories = window.QR_CATALOG;
  const categoryOptions = document.getElementById("category-options");
  const equipmentOptions = document.getElementById("equipment-options");
  const qrImage = document.getElementById("qr-image");
  const equipmentName = document.getElementById("equipment-name");
  const equipmentCode = document.getElementById("equipment-code");
  const categoryPositions = [53, 117, 181, 245, 313, 379, 449, 511, 578, 648, 718, 117];
  let currentCategory;

  function createRadio(group, value, text) {
    const input = document.createElement("input");
    input.type = "radio";
    input.className = "radio";
    input.name = group;
    input.value = value;
    input.setAttribute("aria-label", text);
    return input;
  }

  function renderCategories() {
    const fragment = document.createDocumentFragment();

    categories.forEach((category, index) => {
      const label = document.createElement("label");
      label.className = "category-option";
      label.dataset.category = category.id;
      label.style.setProperty("--x", categoryPositions[index]);
      label.append(createRadio("category", category.id, category.label));

      const name = document.createElement("span");
      name.className = "category-name";
      name.setAttribute("aria-hidden", "true");
      const characters = category.id === "cip" ? ["CIP", "系", "统"] : [...category.label];
      characters.forEach((character) => {
        const line = document.createElement("span");
        line.textContent = character;
        name.append(line);
      });
      label.append(name);
      fragment.append(label);
    });

    categoryOptions.append(fragment);
  }

  function renderEquipment(category) {
    const legend = document.createElement("legend");
    legend.className = "visually-hidden";
    legend.textContent = `选择${category.label}`;
    const fragment = document.createDocumentFragment();
    fragment.append(legend);

    category.items.forEach((item) => {
      const label = document.createElement("label");
      label.className = "equipment-option";
      label.append(createRadio("equipment", String(item.slide), item.option));

      const name = document.createElement("span");
      name.className = "equipment-label";
      name.textContent = item.option;
      name.setAttribute("aria-hidden", "true");
      label.append(name);
      fragment.append(label);
    });

    equipmentOptions.replaceChildren(fragment);
  }

  function selectEquipment(category, item, updateHistory = true) {
    if (currentCategory !== category.id) {
      renderEquipment(category);
      currentCategory = category.id;
    }

    for (const input of categoryOptions.querySelectorAll("input")) {
      input.checked = input.value === category.id;
    }
    for (const input of equipmentOptions.querySelectorAll("input")) {
      input.checked = input.value === String(item.slide);
    }

    const source = `./assets/qrcodes/slide-${item.slide}.png`;
    if (qrImage.getAttribute("src") !== source) qrImage.src = source;
    qrImage.alt = `${item.name} ${item.code} 的二维码`;
    equipmentName.textContent = item.name;
    equipmentCode.textContent = item.code;
    document.title = `${item.name} ${item.code} · 设备二维码`;

    if (updateHistory) {
      const hash = `#${category.id}/${encodeURIComponent(item.code)}`;
      if (window.location.hash !== hash) window.location.hash = hash;
    }
  }

  function restoreLocation() {
    const [categoryId, code] = window.location.hash.slice(1).split("/");
    const category = categories.find((candidate) => candidate.id === categoryId) || categories[0];
    const item = category.items.find((candidate) => encodeURIComponent(candidate.code) === code) || category.items[0];
    selectEquipment(category, item, false);
  }

  categoryOptions.addEventListener("change", (event) => {
    if (event.target.name !== "category") return;
    const category = categories.find((candidate) => candidate.id === event.target.value);
    if (category) selectEquipment(category, category.items[0]);
  });

  equipmentOptions.addEventListener("change", (event) => {
    if (event.target.name !== "equipment") return;
    const category = categories.find((candidate) => candidate.id === currentCategory);
    const item = category.items.find((candidate) => candidate.slide === Number(event.target.value));
    if (item) selectEquipment(category, item);
  });

  window.addEventListener("hashchange", restoreLocation);
  renderCategories();
  restoreLocation();
})();
