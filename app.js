// app.js - Main Application Logic
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  get,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Ingredient list in exact order
const INGREDIENTS = [
  "White Rice",
  "Brown Rice",
  "Black Beans",
  "Pinto Beans",
  "Chicken",
  "Queso",
  "Steak",
  "Carne Asada",
  "Barbacoa",
  "Carnitas",
  "Fajitas",
  "Sofritas",
];

// Status labels
const STATUS_LABELS = {
  normal: "Normal",
  half: "Halfway",
  low: "Low",
  empty: "Empty",
};

// Optional: Audio alert for status changes
let audioContext;
function playAlert() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3
    );
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log("Audio not available");
  }
}

// Initialize ingredients in Firebase if they don't exist
async function initializeIngredients(line) {
  const lineRef = ref(database, `lines/${line}`);
  const snapshot = await get(lineRef);

  if (!snapshot.exists()) {
    const initialData = {};
    INGREDIENTS.forEach((ingredient) => {
      initialData[ingredient] = {
        status: "normal",
        ts: Date.now(),
      };
    });
    await set(lineRef, initialData);
  }
}

// Show toast notification
function showToast(message, undoCallback = null) {
  const toast = document.getElementById("toast");

  if (undoCallback) {
    const undoSpan = document.createElement("span");
    undoSpan.className = "toast-undo";
    undoSpan.textContent = "Undo?";
    undoSpan.onclick = () => {
      undoCallback();
      toast.classList.remove("show");
    };
    toast.innerHTML = message + " ";
    toast.appendChild(undoSpan);
  } else {
    toast.textContent = message;
  }

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// LINE INTERFACE
export async function initializeLineInterface(line) {
  await initializeIngredients(line);

  const grid = document.getElementById("ingredientsGrid");
  const modal = document.getElementById("statusModal");
  const modalTitle = document.getElementById("modalTitle");
  const cancelBtn = document.getElementById("cancelBtn");

  let currentIngredient = null;
  let previousStatus = null;

  // Create ingredient cards
  INGREDIENTS.forEach((ingredient) => {
    const card = document.createElement("div");
    card.className = "ingredient-card";
    card.dataset.ingredient = ingredient;

    card.innerHTML = `
            <div class="ingredient-name">${ingredient}</div>
            <div class="status-indicator">
                <span class="status-dot"></span>
                <span class="status-text">Normal</span>
            </div>
        `;

    card.onclick = () => {
      currentIngredient = ingredient;
      modalTitle.textContent = `${ingredient} Status`;
      modal.classList.add("show");
    };

    grid.appendChild(card);
  });

  // Modal status button handlers
  document.querySelectorAll(".status-btn").forEach((btn) => {
    btn.onclick = async () => {
      const status = btn.dataset.status;
      const ingredientRef = ref(database, `lines/${line}/${currentIngredient}`);

      // Get current status for undo
      const snapshot = await get(ingredientRef);
      previousStatus = snapshot.val()?.status || "normal";

      // Update status
      await set(ingredientRef, {
        status: status,
        ts: Date.now(),
      });

      modal.classList.remove("show");

      // Show toast with undo option
      showToast(
        `${currentIngredient} set to ${STATUS_LABELS[status].toUpperCase()}`,
        async () => {
          await set(ingredientRef, {
            status: previousStatus,
            ts: Date.now(),
          });
        }
      );
    };
  });

  // Cancel button
  cancelBtn.onclick = () => {
    modal.classList.remove("show");
  };

  // Close modal on background click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
    }
  };

  // Listen for updates from Firebase
  INGREDIENTS.forEach((ingredient) => {
    const ingredientRef = ref(database, `lines/${line}/${ingredient}`);
    onValue(ingredientRef, (snapshot) => {
      const data = snapshot.val();
      const card = grid.querySelector(`[data-ingredient="${ingredient}"]`);

      if (card && data) {
        const dot = card.querySelector(".status-dot");
        const text = card.querySelector(".status-text");
        const status = data.status || "normal";

        // Update dot color
        dot.className = "status-dot";
        if (status !== "normal") {
          dot.classList.add(status);
        }

        // Update text
        text.textContent = STATUS_LABELS[status];
      }
    });
  });

  // Listen for "prepped" confirmations from kitchen
  const lineRef = ref(database, `lines/${line}`);
  let isFirstLoad = true;
  onValue(lineRef, (snapshot) => {
    if (isFirstLoad) {
      isFirstLoad = false;
      return;
    }

    const data = snapshot.val();
    if (data) {
      Object.entries(data).forEach(([ingredient, value]) => {
        if (value.status === "normal" && value.ts > Date.now() - 2000) {
          showToast(`✓ ${ingredient} has been prepped!`);
        }
      });
    }
  });
}

// KITCHEN INTERFACE
export async function initializeKitchenInterface() {
  await initializeIngredients("main");
  await initializeIngredients("delivery");

  const grid = document.getElementById("ingredientsGrid");
  const mainTab = document.getElementById("mainTab");
  const deliveryTab = document.getElementById("deliveryTab");
  const mainBadge = document.getElementById("mainBadge");
  const deliveryBadge = document.getElementById("deliveryBadge");

  let currentLine = "main";
  let mainStatuses = {}; // Store main line statuses
  let deliveryStatuses = {}; // Store delivery line statuses
  let activeListeners = []; // Track active Firebase listeners to clean them up

  // Status priority for sorting (lower number = higher priority)
  const STATUS_PRIORITY = {
    empty: 0,
    low: 1,
    half: 2,
    normal: 3,
  };

  // Get current line's status object
  function getCurrentStatuses() {
    return currentLine === "main" ? mainStatuses : deliveryStatuses;
  }

  // Create ingredient cards in sorted order
  function createCards() {
    grid.innerHTML = "";

    const ingredientStatuses = getCurrentStatuses();

    // Sort ingredients by status priority
    const sortedIngredients = [...INGREDIENTS].sort((a, b) => {
      const statusA = ingredientStatuses[a] || "normal";
      const statusB = ingredientStatuses[b] || "normal";
      return STATUS_PRIORITY[statusA] - STATUS_PRIORITY[statusB];
    });

    sortedIngredients.forEach((ingredient) => {
      const card = document.createElement("div");
      card.className = "ingredient-card";
      card.dataset.ingredient = ingredient;

      card.innerHTML = `
                <div class="ingredient-name">${ingredient}</div>
                <div class="status-indicator">
                    <span class="status-dot"></span>
                    <span class="status-text">Normal</span>
                </div>
                <button class="prepped-btn">Prepped ✓</button>
            `;

      const preppedBtn = card.querySelector(".prepped-btn");
      preppedBtn.onclick = async () => {
        const ingredientRef = ref(
          database,
          `lines/${currentLine}/${ingredient}`
        );
        await set(ingredientRef, {
          status: "normal",
          ts: Date.now(),
        });
        showToast(`${ingredient} marked as prepped!`);
      };

      grid.appendChild(card);
    });
  }

  createCards();

  // Tab switching
  function switchTab(line) {
    currentLine = line;
    mainTab.classList.toggle("active", line === "main");
    deliveryTab.classList.toggle("active", line === "delivery");

    // Clean up old listeners before switching
    activeListeners.forEach((unsubscribe) => unsubscribe());
    activeListeners = [];

    // Recreate cards and set up new listeners for the selected line
    createCards();
    updateCards();
  }

  mainTab.onclick = () => switchTab("main");
  deliveryTab.onclick = () => switchTab("delivery");

  // Update cards based on current line
  function updateCards() {
    const ingredientStatuses = getCurrentStatuses();

    INGREDIENTS.forEach((ingredient) => {
      const ingredientRef = ref(database, `lines/${currentLine}/${ingredient}`);

      // Store the unsubscribe function so we can clean up later
      const unsubscribe = onValue(ingredientRef, (snapshot) => {
        const data = snapshot.val();
        const status = data?.status || "normal";

        // Store current status for sorting in the correct line object
        const oldStatus = ingredientStatuses[ingredient];
        ingredientStatuses[ingredient] = status;

        // If status changed and affects sort order, recreate cards
        if (oldStatus !== status && oldStatus !== undefined) {
          // Clean up old listeners before recreating
          activeListeners.forEach((unsub) => unsub());
          activeListeners = [];

          createCards();
          updateCards(); // Re-establish listeners
          return;
        }

        const card = grid.querySelector(`[data-ingredient="${ingredient}"]`);

        if (card && data) {
          const dot = card.querySelector(".status-dot");
          const text = card.querySelector(".status-text");

          // Update card styling
          card.className = "ingredient-card";
          card.classList.add(`status-${status}`);

          // Update dot color
          dot.className = "status-dot";
          if (status !== "normal") {
            dot.classList.add(status);
          }

          // Update text
          text.textContent = STATUS_LABELS[status];
        }
      });

      activeListeners.push(unsubscribe);
    });
  }

  updateCards();

  // Check for alerts on the other line (for badges)
  function checkOtherLineAlerts(line, badgeElement, isMainLine) {
    const lineRef = ref(database, `lines/${line}`);
    onValue(lineRef, (snapshot) => {
      const data = snapshot.val();
      let hasAlert = false;

      if (data) {
        // Update the status cache for this line
        const statusCache = isMainLine ? mainStatuses : deliveryStatuses;
        Object.entries(data).forEach(([ingredient, value]) => {
          statusCache[ingredient] = value.status;
          if (value.status === "low" || value.status === "empty") {
            hasAlert = true;
          }
        });
      }

      // Only show badge if we're NOT currently viewing this line
      if (hasAlert && currentLine !== line) {
        badgeElement.classList.add("show");
        playAlert();
      } else {
        badgeElement.classList.remove("show");
      }
    });
  }

  // Monitor both lines for cross-tab notifications
  // Main line data updates delivery badge
  checkOtherLineAlerts("main", deliveryBadge, true);
  // Delivery line data updates main badge
  checkOtherLineAlerts("delivery", mainBadge, false);

  // Update badges when switching tabs
  mainTab.addEventListener("click", () => {
    mainBadge.classList.remove("show");
    // Check if delivery has alerts to show delivery badge
    const hasDeliveryAlert = Object.values(deliveryStatuses).some(
      (status) => status === "low" || status === "empty"
    );
    if (hasDeliveryAlert) {
      deliveryBadge.classList.add("show");
    }
  });

  deliveryTab.addEventListener("click", () => {
    deliveryBadge.classList.remove("show");
    // Check if main has alerts to show main badge
    const hasMainAlert = Object.values(mainStatuses).some(
      (status) => status === "low" || status === "empty"
    );
    if (hasMainAlert) {
      mainBadge.classList.add("show");
    }
  });
}
