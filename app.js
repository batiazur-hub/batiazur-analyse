const state = {
  page: "home",
  shape: "rect",
  floor: "flat",
  param: "ph",
  shockType: "nonstab",
  shockProduct: "chlorite",
  lastVolume: 0,
  lastResultText: "",
  faqReady: false
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(14);
  } catch (e) {}
}

function press(el) {
  if (!el) return;
  el.classList.add("pressed");
  setTimeout(() => el.classList.remove("pressed"), 170);
  haptic();
}

function num(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const n = parseFloat(String(el.value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function fmt(n, digits) {
  digits = digits === undefined ? 1 : digits;
  if (!Number.isFinite(n)) return "--";
  return Number(n.toFixed(digits)).toLocaleString("fr-FR");
}

function mass(g) {
  if (!Number.isFinite(g)) return "--";
  if (g >= 1000) return fmt(g / 1000, 2) + " kg";
  return fmt(g, 0) + " g";
}

function showPage(page) {
  state.page = page;
  $all(".page").forEach(function(p) { p.classList.remove("active"); });
  var next = document.getElementById("page-" + page);
  if (next) next.classList.add("active");

  var validTabs = ["home", "volume", "dosage", "faq"];
  var tabPage = validTabs.includes(page) ? page : "home";

  var tabbar = $("#tabbar");
  if (tabbar) {
    tabbar.dataset.active = tabPage;
    tabbar.classList.remove("bounce");
    void tabbar.offsetWidth;
    tabbar.classList.add("bounce");
  }

  $all(".tab").forEach(function(tab) {
    tab.classList.toggle("active", tab.dataset.page === tabPage);
  });

  var overlay = document.getElementById("faqInputOverlay");
  var app = document.querySelector(".app");
  if (page === "faq") {
    if (overlay) overlay.style.display = "flex";
    if (app) app.classList.add("faq-active");
    if (!state.faqReady) {
      state.faqReady = true;
      faqInit();
    }
  } else {
    if (overlay) overlay.style.display = "none";
    if (app) app.classList.remove("faq-active");
  }

  if (page === "dosage") syncVolumeToDose();
  haptic();
}

function setActiveButton(selector, key, value) {
  $all(selector).forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset[key] === value);
  });
}

function updateVolumeFields() {
  var isRound = state.shape === "round";
  $all(".field-rect").forEach(function(el) { el.classList.toggle("hidden", isRound); });
  $all(".field-round").forEach(function(el) { el.classList.toggle("hidden", !isRound); });
  $all(".depth-flat").forEach(function(el) { el.classList.toggle("hidden", state.floor !== "flat"); });
  $all(".depth-slope").forEach(function(el) { el.classList.toggle("hidden", state.floor !== "slope"); });
  $all(".depth-diamond").forEach(function(el) { el.classList.toggle("hidden", state.floor !== "diamond"); });
}

function baseArea() {
  if (state.shape === "round") {
    var d = num("diameter");
    return d * d * 0.785;
  }
  var l = num("length");
  var w = num("width");
  var coeff = { rect: 1, oval: 0.89, hex: 0.83, free: 0.85 }[state.shape] || 1;
  return l * w * coeff;
}

function averageDepth() {
  if (state.floor === "flat") return num("depth");
  if (state.floor === "slope") {
    return (num("depthMin") + num("depthMax")) / 2;
  }
  var edge = num("depthEdge");
  var center = num("depthCenter");
  return edge + ((center - edge) / 3);
}

function setResult(id, title, text) {
  var box = document.getElementById(id);
  if (!box) return;
  var strong = box.querySelector("strong");
  var p = box.querySelector("p");
  if (strong) strong.textContent = title;
  if (p) p.textContent = text;
  box.classList.remove("is-fresh");
  void box.offsetWidth;
  box.classList.add("is-fresh");
}

function calculateVolume() {
  var volume = baseArea() * averageDepth();
  if (!Number.isFinite(volume) || volume <= 0) {
    setResult("volumeResult", "Dimensions a vérifier", "Renseigne les dimensions visibles et la profondeur.");
    return;
  }
  state.lastVolume = volume;
  localStorage.setItem("batiAzurAnalyseVolume", String(volume.toFixed(1)));
  setValue("doseVolume", volume.toFixed(1));
  var homeVolume = $("#homeVolumeText");
  if (homeVolume) {
    homeVolume.textContent = "Dernier volume calcule : " + fmt(volume, 1) + " m³. Il sera repris automatiquement dans Dosage.";
  }
  setResult(
    "volumeResult",
    fmt(volume, 1) + " m³",
    "Volume repris automatiquement dans la page Dosage. Si le client connait deja son volume, il peut aussi le saisir directement dans Dosage."
  );
}

function syncVolumeToDose() {
  var input = $("#doseVolume");
  if (!input) return;
  if (state.lastVolume > 0) {
    input.value = state.lastVolume.toFixed(1);
    return;
  }
  var stored = parseFloat(localStorage.getItem("batiAzurAnalyseVolume") || "0");
  if (stored > 0) {
    state.lastVolume = stored;
    input.value = stored.toFixed(1);
  }
}

function renderParamFields() {
  var root = $("#paramFields");
  var title = $("#calcTitle");
  if (!root) return;
  var titleMap = {
    ph: "Correction pH",
    tac: "Correction TAC",
    salt: "Correction sel",
    stabilizer: "Correction stabilisant",
    shock: "Chlore choc",
    brome: "Brome choc",
    metals: "Sequestrant metaux"
  };
  if (title) title.textContent = titleMap[state.param] || "Calcul";

  if (state.param === "ph") {
    root.innerHTML = '<div class="form-grid"><label class="field"><span>pH mesure</span><input id="phCurrent" type="number" inputmode="decimal" step="0.1" placeholder="Ex. 7,6"></label><label class="field"><span>pH souhaite · idéal 7,2</span><input id="phTarget" type="number" inputmode="decimal" step="0.1" value="7.2"></label></div><div class="warning">pH plus et pH moins : correction toujours par apports de 0,2. On affiche dose par apport + total.</div>';
  }

  if (state.param === "tac") {
    root.innerHTML = '<div class="form-grid"><label class="field"><span>TAC mesure en ppm</span><input id="tacCurrent" type="number" inputmode="decimal" step="1" placeholder="Ex. 80"></label><label class="field"><span>TAC souhaite · idéal 150</span><input id="tacTarget" type="number" inputmode="decimal" step="1" value="150"></label></div>';
  }

  if (state.param === "salt") {
    root.innerHTML = '<div class="chip-row"><button class="chip active" type="button" data-salt-target="5">Standard 5 g/L</button><button class="chip" type="button" data-salt-target="1.5">Low Salt 1,5 g/L</button><button class="chip" type="button" data-salt-target="">Personnalise</button></div><div class="form-grid"><label class="field"><span>Sel actuel en g/L</span><input id="saltCurrent" type="number" inputmode="decimal" step="0.1" placeholder="Ex. 2,1"></label><label class="field"><span>Sel souhaite en g/L</span><input id="saltTarget" type="number" inputmode="decimal" step="0.1" value="5"></label></div><p class="note">Sacs de sel retenus : 25 kg.</p>';
    $all("[data-salt-target]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        $all("[data-salt-target]").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        setValue("saltTarget", btn.dataset.saltTarget);
        press(btn);
      });
    });
  }

  if (state.param === "stabilizer") {
    root.innerHTML = '<div class="form-grid"><label class="field"><span>Stabilisant mesure en ppm</span><input id="stabCurrent" type="number" inputmode="decimal" step="1" placeholder="Ex. 10"></label><label class="field"><span>Stabilisant souhaite · idéal 30</span><input id="stabTarget" type="number" inputmode="decimal" step="1" value="30"></label></div>';
  }

  if (state.param === "shock") {
    root.innerHTML = '<h2 class="spaced-title">Type de chlore choc</h2><div class="chip-row"><button class="chip active" type="button" data-shock-type="nonstab">Non stabilisé</button><button class="chip" type="button" data-shock-type="stab">Stabilise</button></div><h2 class="spaced-title">Produit</h2><div class="chip-row" id="shockProductRow"></div><div class="warning hidden" id="shockWarning">Attention : un chlore choc stabilisé augmente le taux de stabilisant.</div>';
    $all("[data-shock-type]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        $all("[data-shock-type]").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.shockType = btn.dataset.shockType;
        state.shockProduct = state.shockType === "stab" ? "tabs" : "chlorite";
        renderShockProducts();
        press(btn);
      });
    });
    renderShockProducts();
  }

  if (state.param === "brome") {
    root.innerHTML = '<p class="note">Brome choc : 150 g pour 10 m³.</p>';
  }

  if (state.param === "metals") {
    root.innerHTML = '<p class="note">Sequestrant metaux : 0,5 L pour 100 m³.</p>';
  }
}

function renderShockProducts() {
  var row = $("#shockProductRow");
  var warning = $("#shockWarning");
  if (!row) return;
  var options = state.shockType === "stab"
    ? [["tabs", "Pastilles"], ["granules", "Granule"]]
    : [["chlorite", "Chlorite"], ["ritocal", "Ritocal GR"]];
  row.innerHTML = options.map(function(opt) {
    return '<button class="chip ' + (state.shockProduct === opt[0] ? "active" : "") + '" type="button" data-shock-product="' + opt[0] + '">' + opt[1] + '</button>';
  }).join("");
  if (warning) warning.classList.toggle("hidden", state.shockType !== "stab");
  $all("[data-shock-product]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      state.shockProduct = btn.dataset.shockProduct;
      $all("[data-shock-product]").forEach(function(b) { b.classList.toggle("active", b === btn); });
      press(btn);
    });
  });
}

function instructionsFor(param, context) {
  context = context || {};
  var base = "Filtration 24 h obligatoire.";
  if (param === "ph") return "Application : diluer le produit dans un seau d'eau, verser delicatement devant les buses de refoulement. Attendre 20 minutes entre chaque apport de 0,2. " + base;
  if (param === "tac") return "Application : verser directement dans l'eau, en une seule fois, dans une partie calme du bassin. Ne pas fractionner. " + base;
  if (param === "salt") return "Application : verser le sel directement dans l'eau du bassin, reparti sur la surface. Ne pas verser dans le skimmer. " + base;
  if (param === "stabilizer") return "Application : diluer le stabilisant puis le verser dans le bassin. " + base;
  if (param === "metals") return "Application : verser le sequestrant metaux directement dans l'eau du bassin. " + base;
  if (param === "shock") {
    if (context.product === "tabs") return "Application : mettre les pastilles dans le panier de skimmer. " + base;
    return "Application : diluer le chlore choc dans un seau d'eau, puis verser tout autour du bassin. " + base;
  }
  return base;
}

function calculateDose() {
  syncVolumeToDose();
  var volume = num("doseVolume");
  if (volume <= 0) {
    setResult("doseResult", "Volume manquant", "Renseigne le volume du bassin ou calcule-le dans l'onglet Volume.");
    return;
  }
  var title = "";
  var text = "";

  if (state.param === "ph") {
    var current = num("phCurrent");
    var target = num("phTarget");
    var diff = target - current;
    if (!current || !target || Math.abs(diff) < 0.01) {
      title = "Pas de correction";
      text = "Renseigne un pH mesure différent du pH souhaite.";
    } else {
      var product = diff > 0 ? "pH plus" : "pH moins";
      var correction = Math.abs(diff);
      var steps = Math.ceil((correction - 0.0001) / 0.2);
      var dosePerStep = product === "pH plus" ? (volume / 10) * 150 : (volume / 10) * 200;
      var total = dosePerStep * steps;
      title = mass(total) + " au total";
      text = product + " · Correction : " + fmt(correction, 1) + " pH. " + steps + " apport" + (steps > 1 ? "s" : "") + " de 0,2. Dose par apport : " + mass(dosePerStep) + ". Ne pas verser la dose totale d'un coup. " + instructionsFor("ph");
    }
  }

  if (state.param === "tac") {
    var inc = num("tacTarget") - num("tacCurrent");
    if (inc <= 0) {
      title = "Pas d'ajout";
      text = "Le TAC est deja au niveau cible ou au-dessus.";
    } else {
      var g = (volume / 10) * 170 * (inc / 10);
      title = mass(g);
      text = "TAC+ · Augmentation souhaitee : " + fmt(inc, 0) + " ppm. Dosage : 170 g pour 10 m³ pour +10 ppm. " + instructionsFor("tac");
    }
  }

  if (state.param === "salt") {
    var saltInc = num("saltTarget") - num("saltCurrent");
    if (saltInc <= 0) {
      title = "Pas d'ajout";
      text = "Le taux de sel est deja au niveau cible ou au-dessus.";
    } else {
      var kg = volume * saltInc;
      var bags = Math.ceil(kg / 25);
      title = fmt(kg, 1) + " kg";
      text = "Sel · Prevoir " + bags + " sac" + (bags > 1 ? "s" : "") + " de 25 kg. Quantite reelle avec sacs entiers : " + (bags * 25) + " kg. " + instructionsFor("salt");
    }
  }

  if (state.param === "stabilizer") {
    var stabInc = num("stabTarget") - num("stabCurrent");
    if (stabInc <= 0) {
      title = "Pas d'ajout";
      text = "Le stabilisant est deja au niveau cible ou au-dessus.";
    } else {
      var stabG = (volume / 10) * 100 * (stabInc / 10);
      title = mass(stabG);
      text = "Stabilisant / acide cyanurique · +" + fmt(stabInc, 0) + " ppm. Dosage : 100 g pour 10 m³ pour +10 ppm. " + instructionsFor("stabilizer");
    }
  }

  if (state.param === "shock") {
    var amount = 0;
    var unit = "g";
    var productName = "";
    var note = "";
    if (state.shockProduct === "chlorite") {
      amount = (volume / 10) * 70;
      productName = "Chlorite non stabilisé";
      note = "70 g pour 10 m³.";
    }
    if (state.shockProduct === "ritocal") {
      amount = volume * 20;
      productName = "Ritocal GR non stabilisé";
      note = "20 g par m³.";
    }
    if (state.shockProduct === "tabs") {
      amount = (volume / 10) * 4;
      unit = "pastilles";
      productName = "Chlore choc pastilles stabilisé";
      note = "4 pastilles pour 10 m³. Attention au stabilisant.";
    }
    if (state.shockProduct === "granules") {
      amount = (volume / 10) * 80;
      productName = "Chlore choc granule stabilisé";
      note = "80 g pour 10 m³. Attention au stabilisant.";
    }
    title = unit === "g" ? mass(amount) : fmt(amount, 1) + " pastilles";
    text = productName + " · " + note + " " + instructionsFor("shock", { product: state.shockProduct });
  }

  if (state.param === "brome") {
    var bromeG = (volume / 10) * 150;
    title = mass(bromeG);
    text = "Brome choc · Dosage : 150 g pour 10 m³. Filtration 24 h obligatoire.";
  }

  if (state.param === "metals") {
    var liters = volume * 0.005;
    title = liters < 1 ? fmt(liters * 1000, 0) + " mL" : fmt(liters, 2) + " L";
    text = "Sequestrant metaux · Dosage : 0,5 L pour 100 m³. " + instructionsFor("metals");
  }

  setResult("doseResult", title || "Erreur", text || "Aucun calcul disponible pour ce paramètre.");
  state.lastResultText = "BatiAzur Analyse\nVolume : " + fmt(volume, 1) + " m³\nResultat : " + title + "\n" + text;
  var mail = $("#mailResult");
  if (mail) {
    mail.href = "mailto:?subject=Analyse%20BatiAzur%20Analyse&body=" + encodeURIComponent(state.lastResultText);
  }
}

async function loadNews() {
  var list = $("#newsList");
  try {
    var response = await fetch("./actus.json?cache=" + Date.now());
    var data = await response.json();
    if (list) {
      list.innerHTML = (data.items || []).map(function(item) {
        var image = item.image ? '<img class="news-image" src="' + escapeHtml(item.image) + '" alt="">' : '<div class="news-image"></div>';
        var buttons = (item.buttons || []).map(function(btn) {
          return '<a class="secondary-btn" href="' + escapeHtml(btn.url) + '" target="' + (String(btn.url).startsWith("http") ? "_blank" : "_self") + '" rel="noopener">' + escapeHtml(btn.label || "Ouvrir") + "</a>";
        }).join("");
        return '<article class="card news-card"><div class="news-meta"><span class="news-pill">' + escapeHtml(item.category || "Actualite") + '</span><span class="news-pill">' + escapeHtml(item.date || "") + '</span></div><h2>' + escapeHtml(item.title || "Actualite") + "</h2>" + image + "<p>" + escapeHtml(item.text || "") + "</p>" + '<div class="news-actions">' + buttons + "</div></article>";
      }).join("") || '<section class="card"><h2>Aucune actualite</h2><p>Ajoute une actualite avec admin-actus.html puis remplace actus.json sur GitHub.</p></section>';
    }
  } catch (e) {
    if (list) list.innerHTML = '<section class="card"><h2>Actualites indisponibles</h2><p>Le fichier actus.json n\'a pas pu être charge.</p></section>';
  }
}

function renderSocialLinks(socials) {
  var root = $("#socialLinks");
  if (!root) return;
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

/* ═══════════════════════════════════════════════════════
   FAQ — Base de connaissances piscine BatiAzur
   ═══════════════════════════════════════════════════════ */

var FAQ_KB = [
  {
    id: "eau-verte",
    tags: ["verte", "vert", "algue", "algues", "verde", "verd", "proliferation", "phosphate", "sable", "filtration", "stabilisant"],
    question: "Eau verte ?",
    title: "Eau verte : diagnostiquer avant de traiter",
    answer: "L'eau verte est due aux algues, mais la vraie cause peut être multiple. Avant tout traitement, analysez l'eau chez BatiAzur pour identifier le ou les problèmes.\n\nCauses les plus fréquentes :\n• pH trop haut : le chlore devient inefficace au-dessus de 7,6 et les algues se développent facilement\n• TAC trop bas : le pH varie trop fortement, rendant le traitement instable\n• Absence ou manque de chlore : sans désinfectant, les algues prolifèrent rapidement\n• Stabilisant trop élevé (> 70 ppm) : le chlore est bloqué et ne peut plus agir\n• Taux de phosphates trop élevé : les phosphates sont la nourriture des algues\n• Filtration inefficace : durée insuffisante ou matériau filtrant épuisé\n• Sable ou verre filtrant trop vieux : un média usé ne filtre plus correctement\n• Sous-dimensionnement de la filtration : pompe ou filtre trop petit pour le volume\n• Combinaison de plusieurs de ces facteurs à la fois\n\nSans connaître la vraie cause, un simple traitement choc ne règlera pas le problème durablement — l'eau reverdira.",
    followUp: ["Valeurs idéales piscine", "Corriger le pH", "Stabilisant", "Chlore choc traitement"]
  },
  {
    id: "eau-trouble",
    tags: ["trouble", "turbide", "opaque", "blanche", "laiteuse", "nuage", "nuageux", "pas claire", "voilee", "fond", "voir le fond"],
    question: "Eau trouble ou laiteuse ?",
    title: "Eau trouble : diagnostiquer avant de traiter",
    answer: "Une eau trouble a les mêmes causes possibles qu'une eau verte. Sans analyse, impossible de savoir laquelle est en jeu.\n\nCauses les plus fréquentes :\n• pH trop haut : le chlore est inefficace, les particules ne se traitent plus\n• TAC trop bas : pH instable, variations importantes\n• Absence ou manque de chlore\n• Stabilisant trop élevé (> 70 ppm) : le chlore est bloqué\n• Taux de phosphates trop élevé\n• Filtration inefficace : durée trop courte ou débit insuffisant\n• Sable ou verre filtrant trop vieux : ne retient plus les particules\n• Sous-dimensionnement de la filtration\n• Combinaison de plusieurs de ces facteurs\n\nTraiter sans diagnostic risque de masquer le problème temporairement. Apportez un échantillon d'eau chez BatiAzur pour une analyse complète.",
    followUp: ["Mon eau est verte", "Valeurs idéales piscine", "Flocculant clarifier eau"]
  },
  {
    id: "eau-mousseuse",
    tags: ["mousse", "mousseux", "mousseuse", "bulles", "écume", "mousse surface", "spa", "jacuzzi", "brome"],
    question: "Mousse en surface ?",
    title: "Mousse : ça dépend de votre installation",
    answer: "La réponse n'est pas la même selon que vous avez un spa ou une piscine.\n\nSpa / jacuzzi :\n• La mousse est normale. Le brome réagit avec l'air injecté dans l'eau et produit naturellement de la mousse. Pas d'inquiétude.\n\nPiscine :\n• Apres un traitement choc suite a une eau verte : la mousse est normale et temporaire, elle disparaît en quelques heures avec la filtration.\n• Dans tous les autres cas : la mousse est le signe d'un déséquilibre et il faut analyser l'eau en profondeur.\n\nNe traitez pas sans savoir : apportez un échantillon chez BatiAzur pour identifier la vraie cause.",
    followUp: ["Mon eau est verte", "Chlore choc traitement", "Valeurs idéales piscine"]
  },
  {
    id: "odeur-chlore",
    tags: ["odeur", "sent", "piquant", "chloramine", "chloramines", "forte odeur", "irrite", "yeux piquent", "dégazage", "trichloramine"],
    question: "Forte odeur de chlore ?",
    title: "Odeur de chlore : attention, c'est un signal d'alarme",
    answer: "L'odeur de chlore ne signifie pas qu'il y en a trop — c'est souvent le contraire.\n\nCe que vous sentez, ce sont les tri-chloramines : le dernier déchet produit par le chlore après qu'il a combattu des algues ou des bactéries. Ce dégazage signifie que le chlore a fait son travail, mais qu'il a peut-être été entièrement consommé dans ce combat.\n\nAutrement dit : si ça sent le chlore, il est possible qu'il n'y en ait plus du tout dans l'eau.\n\nQue faire :\n1. Mesurez immédiatement le taux de chlore avec un comparateur ou des bandelettes\n2. Si le chlore est à 0 ou très bas : traitement choc urgent\n3. Vérifiez aussi le pH — le chlore est inefficace au-dessus de 7,6\n\nC'est précisément pour éviter ces ruptures de chlore qu'un traitement automatique (électrolyseur, pompe doseuse) est recommandé. Passez nous voir chez BatiAzur pour en parler.",
    followUp: ["Corriger le pH", "Chlore choc traitement", "Quel chlore utiliser au quotidien"]
  },
  {
    id: "yeux-rouges",
    tags: ["yeux", "oeil", "pique", "piquent", "brule", "irritation", "rouges", "rouge", "picotement", "larmoiement"],
    question: "Yeux qui piquent ?",
    title: "Yeux qui piquent : pas forcement le chlore",
    answer: "On associe souvent les yeux qui piquent a un excès de chlore, mais c'est rarement la vraie cause.\n\nCauses les plus fréquentes :\n• pH trop acide (moins de 7,2) : l'eau agresse les muqueuses et les yeux\n• pH trop basique (plus de 7,8) : même effet irritant\n• TAC trop bas : provoque de grandes variations du pH, qui peut basculer brutalement dans une zone irritante\n\nCe qu'il faut faire :\n1. Mesurez le pH avec un comparateur\n2. Si le pH est hors de la zone 7,2 - 7,4, corrigez-le\n3. Vérifiez aussi le TAC — un TAC trop bas rend le pH instable et difficile à maintenir\n\nSans analyse précise, difficile de savoir lequel des deux est en cause. Apportez un échantillon chez BatiAzur.",
    followUp: ["Corriger le pH", "TAC alcalinité", "Valeurs idéales piscine"]
  },
  {
    id: "calcaire",
    tags: ["calcaire", "tartre", "blanc", "dépôt", "dépôts", "trace", "traces", "incrustation", "incrustations", "entartrage", "parois", "buses", "ligne eau"],
    question: "Depots blancs sur les parois ou les buses ?",
    title: "Depots blancs : trois causes possibles",
    answer: "Un dépôt blanc peut avoir trois origines différentes, et le traitement n'est pas le même selon la cause.\n\n• Metaux (fer, manganese, calcaire metallique) : dépôt dur, souvent localise autour des buses ou sur le fond\n• Algues : dépôt plutot mou ou glissant, parfois teinte de vert ou de gris\n• Calcaire (tartre) : dépôt blanc dur et rugueux, signe d'un TH ou d'un TAC trop élevé\n\nSans analyse, impossible de savoir laquelle de ces trois causes est en jeu. Traiter pour du calcaire si c'est des metaux, ou inversement, peut aggraver la situation.\n\nApportez un échantillon d'eau chez BatiAzur — nous pourrons identifier la cause et vous recommander le bon traitement.",
    followUp: ["Taches ou eau coloree metaux", "Mon eau est verte", "Valeurs idéales piscine"]
  },
  {
    id: "metaux",
    tags: ["fer", "manganese", "cuivre", "rose", "rouille", "brun", "tache", "taches", "colore", "sequestrant", "metal", "metaux", "ocre", "noir", "orange", "violet", "jaune", "gris", "couleur", "fond", "paroi"],
    question: "Taches sur le fond ou les parois ?",
    title: "Taches : la couleur vous donne l'indice",
    answer: "La couleur des taches est le premier indicateur de la cause. Voici comment les lire :\n\n• Noir : bactéries\n• Vert : algues ou fer\n• Orange : fer\n• Violet / bleu-vert : cuivre\n• Blanc : metaux, algues ou calcaire (plusieurs causes possibles)\n• Jaune : calcaire ou algues moutarde\n• Gris : metaux\n\nDans tous les cas, la couleur seule ne suffit pas à un diagnostic certain — d'autres paramètres de l'eau entrent en jeu. Un traitement inadapté peut fixer definitivement les taches ou aggraver la situation.\n\nApportez un échantillon d'eau chez BatiAzur avec une description (ou photo) des taches : couleur, localisation, texture. Nous vous orientons vers le bon traitement.",
    followUp: ["Depots blancs parois buses", "Mon eau est verte", "Valeurs idéales piscine"]
  },
  {
    id: "algues-noires",
    tags: ["algues noires", "noires", "noire", "taches noires", "point noir", "points noirs", "algue noire", "bactérie"],
    question: "Les algues noires, c'est quoi ?",
    title: "Algues noires : en realite des bactéries",
    answer: "Les algues noires ne sont pas vraiment des algues — ce sont des bactéries.\n\nEt ce qui les rend si difficiles a traiter, c'est leur localisation : elles se trouvent de l'autre cote du revêtement (liner ou beton). Pour les eliminer, il faut donc traiter depuis l'eau de la piscine en faisant pénétrer le produit a travers le revêtement jusqu'a elles.\n\nC'est précisément pourquoi les traitements classiques donnent souvent des résultats partiels ou temporaires sur les algues noires.\n\nPour ce type de problème, venez nous voir chez BatiAzur : nos techniciens vous conseilleront le traitement adapté a votre type de revêtement.",
    followUp: ["Taches sur fond parois", "Traitement choc quel produit", "Algicide"]
  },
  {
    id: "ph",
    tags: ["ph", "acidite", "acide", "basique", "alcalin", "ph correction", "ph mesure", "potentiel hydrogène"],
    question: "C'est quoi le pH ?",
    title: "Le pH : potentiel hydrogène",
    answer: "Le pH, c'est le potentiel hydrogène de l'eau — ça fait toujours bien dans un dîner mondain.\n\nC'est l'indice qui indique si un liquide est acide ou basique :\n• En dessous de 7 : acide\n• Au-dessus de 7 : basique\n• Exactement 7 : neutre\n\nPour une piscine, la zone idéale est entre 7,2 et 7,4. Pourquoi ce n'est pas exactement 7 ? Parce que nos yeux et notre peau fonctionnent mieux dans une eau légèrement basique.\n\nQue se passe-t-il hors de cette zone :\n• pH trop bas (acide) : eau irritante pour les yeux et la peau, corrosive pour le liner et le matériel\n• pH trop haut (basique) : le chlore devient inefficace, risque de dépôts calcaires, eau trouble\n\nC'est le paramètre à surveiller en priorité, car il conditionne l'efficacité de tous les autres traitements.",
    followUp: ["pH trop élevé", "pH trop bas", "Valeurs idéales piscine", "TAC alcalinité"]
  },
  {
    id: "ph-haut",
    tags: ["ph haut", "ph élevé", "ph trop haut", "ph monte", "ph augmente", "ph sup", "ph supérieur", "ph 8", "ph 7.8", "ph 7.9", "ph", "haut", "élevé", "monte", "hausse", "augmente"],
    question: "pH trop élevé (> 7,4) ?",
    title: "pH trop haut : pH minus et vérifier le TAC",
    answer: "Pour baisser le pH, on utilise du pH moins.\n\nMais attention : un pH qui monte peut être le signe d'un TAC trop bas. Un TAC insuffisant ne joue plus son rôle de tampon et laisse le pH varier dans tous les sens — y compris vers le haut.\n\nDonc avant de corriger le pH, vérifiez aussi votre TAC. Si le TAC est trop bas, corrigez-le en premier : cela stabilisera le pH et les corrections tiendront dans le temps. Sinon vous allez corriger le pH en boucle sans jamais règler le vrai problème.\n\nUtilisez l'onglet Dosage de cette application pour calculer la dose exacte de pH moins selon votre volume. Et pour être sur de la cause, apportez un échantillon chez BatiAzur.",
    followUp: ["TAC alcalinité", "Corriger le pH", "Valeurs idéales piscine"]
  },
  {
    id: "ph-bas",
    tags: ["ph bas", "ph trop bas", "ph baisse", "ph descend", "ph inf", "ph inférieur", "ph 6", "ph 7.0", "ph 7.1", "ph", "bas", "baisse", "descend", "chute", "acide"],
    question: "pH trop bas (< 7,2) ?",
    title: "pH trop bas : pH plus et vérifier le TAC",
    answer: "Pour remonter le pH, on utilise du pH plus.\n\nMais attention : un pH qui descend peut être le signe d'un TAC trop bas. Un TAC insuffisant ne joue plus son rôle de tampon et laisse le pH chuter — parfois très vite, notamment après une pluie ou un fort ensoleillement.\n\nSi le TAC est trop bas, corrigez-le en premier. Sinon, vous allez remonter le pH à la main en continu sans jamais stabiliser la situation.\n\nUtilisez l'onglet Dosage de cette application pour calculer la dose exacte de pH plus selon votre volume. Pour un diagnostic complet, apportez un échantillon chez BatiAzur.",
    followUp: ["TAC alcalinité", "Corriger le pH", "Valeurs idéales piscine"]
  },
  {
    id: "tac",
    tags: ["tac", "alcalinité", "alcalin", "tampon", "bicarbonate", "titre alcalimetrique", "carbonate", "ions"],
    question: "C'est quoi le TAC ?",
    title: "Le TAC : le stabilisateur de votre pH",
    answer: "Le TAC, c'est le Titre Alcalimétrique Complet. En termes simples, c'est le taux d'ions carbonates present dans l'eau.\n\nPourquoi c'est important ? Plus ce taux est élevé, plus le pH est stable et resistant aux variations. Un bon TAC empêche le pH de partir dans tous les sens après une pluie, une forte chaleur ou un traitement.\n\nValeur idéale : entre 150 et 250 ppm\n\nConsequences d'un TAC trop bas :\n• Le pH varie fortement et rapidement\n• Risque de verdissement de la piscine (pH instable = chlore inefficace)\n• Perte d'elasticite des revêtements en PVC (liner) : l'eau acide attaque progrèssivement le matériau\n\nConsequences d'un TAC trop haut :\n• Eau entartrante, dépôts calcaires sur les parois et le matériel\n\nRegne d'or : corrigez toujours le TAC avant de corriger le pH. Un TAC stable, c'est un pH qui reste en place.",
    followUp: ["pH trop bas", "pH trop haut", "Valeurs idéales piscine"]
  },
  {
    id: "chlore",
    tags: ["chlore", "chloration", "désinfection", "désinfecter", "galet", "galets", "chlore lent", "hypochlorite", "entretien chlore"],
    question: "Quel chlore utiliser au quotidien ?",
    title: "Chlore d'entretien : le bon choix sur le long terme",
    answer: "Pour l'entretien courant, BatiAzur recommande un chlore non stabilisé à diffusion lente : le Chlorit Stick ou le Ritocal 200 (hypochlorite de calcium).\n\nC'est un peu plus cher que du chlore stabilisé, mais c'est le meilleur choix sur le long terme. Voici pourquoi :\n\nLe chlore stabilisé contient de l'acide cyanurique (stabilisant) qui protège le chlore contre les UV. C'est utile en petite quantité, mais chaque galet de chlore stabilisé en ajoute dans l'eau. Au fil de la saison, le taux de stabilisant monte et finit par empêcher le chlore d'agir — c'est ce qu'on appelle le 'chlore bloqué'.\n\nAvec le Chlorit Stick ou le Ritocal 200, vous désinfectez efficacement sans accumuler de stabilisant, et votre eau reste exploitable beaucoup plus longtemps.\n\nValeur cible de chlore libre : 1 à 1,5 mg/L. Mesurez 2 à 3 fois par semaine en saison.",
    followUp: ["Stabilisant", "Chlore choc traitement", "Valeurs idéales piscine"]
  },
  {
    id: "chlore-choc",
    tags: ["chlore choc", "choc", "chlorite", "ritocal", "traitement choc", "surdésinfection", "sos eau verte", "hypochlorite"],
    question: "Traitement choc : quel produit utiliser ?",
    title: "Chlore choc : SOS Eau Verte ou hypochlorite",
    answer: "Le choix du produit dépend de la situation.\n\nSi votre eau est verte :\n• SOS Eau Verte BatiAzur : combine de l'hypochlorite de calcium et un catalyseur de chlore pour une action plus rapide et plus efficace sur les algues. C'est le produit le plus adapté dans ce cas.\n\nPour tous les autres traitements choc (remise en route, après absence, désinfection préventive...) :\n• Hypochlorite de calcium en poudre : suffit largement. Dissoudre dans un seau d'eau fraîche et verser tout autour du bassin, filtration en marche.\n\nDans les deux cas :\n• Vérifiez et corrigez le pH à 7,2 avant le traitement — le chlore est le plus efficace à ce pH\n• Filtration continue 24 h après\n• Ne pas se baigner pendant le traitement\n\nRappel : privilégiez toujours un chlore non stabilisé pour vos chocs, afin de ne pas accumuler de stabilisant.",
    followUp: ["Mon eau est verte", "Odeur de chlore signal alarme", "Stabilisant"]
  },
  {
    id: "algicide",
    tags: ["algicide", "anti-algue", "anti algue", "algue", "prévention algue", "enzymatique"],
    question: "L'algicide, c'est quoi ?",
    title: "Algicide : en appui du traitement choc",
    answer: "L'algicide est un produit — souvent à base enzymatique — dont le rôle est de tuer les algues.\n\nPoint important : l'algicide n'est pas un traitement autonome. Il s'utilise en appui d'un traitement choc, pas à la place. Le chlore choc attaque les algues, l'algicide complète et renforce l'action.\n\nUtiliser un algicide seul sur une eau verte ne suffira pas a règler le problème durablement.",
    followUp: ["Mon eau est verte", "Traitement choc quel produit", "Eau avec mousse"]
  },
  {
    id: "flocculant",
    tags: ["flocculant", "floculant", "floculation", "clarifier", "clarification", "eau pas claire", "particules", "trouble"],
    question: "Le flocculant, c'est quoi ?",
    title: "Flocculant : éclaircir l'eau en piègeant les particules",
    answer: "Le flocculant sert a éclaircir l'eau et a la rendre moins trouble.\n\nComment ça fonctionne : il agglomère les très fines particules en suspension dans l'eau — trop petites pour être retenues seules par le filtre — et les regroupe en amas plus gros qui se font alors piéger dans le filtre.\n\nResultat : l'eau devient progrèssivement plus claire et plus transparente.",
    followUp: ["Eau trouble ou laiteuse", "Mon eau est verte", "Valeurs idéales piscine"]
  },
  {
    id: "sel",
    tags: ["sel", "sale", "électrolyseur", "électrolyse", "salinité", "chlorure", "sel piscine", "hypochlorite sodium", "chlorure sodium"],
    question: "Le sel dans la piscine, c'est pour quoi ?",
    title: "Sel et électrolyseur : le meilleur chlore qui existe",
    answer: "Le sel dans une piscine ne sert pas a la rendre sallee — il sert a produire du chlore.\n\nVoici comment ça fonctionne : l'électrolyseur divise la molecule de sel (chlorure de sodium) en deux éléments — du chlore et de la soude. Ce chlore produit sur place s'appelle l'hypochlorite de sodium, et c'est le meilleur chlore qui existe pour une piscine.\n\nAvantages :\n• Chlore produit en continu, automatiquement\n• Pas d'accumulation de stabilisant (contrairement aux galets stabilisés)\n• Eau plus douce et plus agreable à l'œil\n• Plus economique sur le long terme\n\nLe sel lui-même n'est pas consommé — il est recycle en permanence par l'électrolyseur. On n'en rajoute que pour compenser les pertes par eclaboussures, vidanges ou pluies.",
    followUp: ["Quel chlore utiliser au quotidien", "Stabilisant", "Valeurs idéales piscine"]
  },
  {
    id: "stabilisant",
    tags: ["stabilisant", "stabiliseur", "cyanurique", "acide cyanurique", "uv", "soleil", "sun", "évapore", "bloqué", "haut", "élevé", "monte", "hausse", "trop haut"],
    question: "Le stabilisant, c'est quoi ?",
    title: "Stabilisant : ni trop, ni trop peu",
    answer: "Le stabilisant, ou acide cyanurique, protège le chlore contre les UV du soleil. Sans lui, le chlore s'évapore rapidement sous l'effet du soleil et n'a plus le temps d'agir.\n\nValeur idéale : entre 30 et 50 ppm\n\nC'est un équilibre à trouver :\n• Trop peu de stabilisant (< 30 ppm) : le chlore s'évapore trop vite et ne désinfecte plus efficacement\n• Trop de stabilisant (> 50 ppm) : le stabilisant empêche le chlore d'agir — c'est ce qu'on appelle le chlore bloqué\n\nLe stabilisant ne se consomme pas et ne se détruit pas : il s'accumule dans l'eau au fil des traitements au chlore stabilisé. C'est pour ça que BatiAzur recommande le chlore non stabilisé pour l'entretien courant.\n\nSi le taux est trop élevé, la seule solution est la dilution : vidanger une partie du bassin et remplir d'eau fraîche.",
    followUp: ["Quel chlore utiliser au quotidien", "Chlore choc quel produit", "Valeurs idéales piscine"]
  },
  {
    id: "filtration",
    tags: ["filtration", "filtre", "pompe", "heure filtration", "durée filtration", "filtr", "combien d'heure", "canicule", "chaleur"],
    question: "Combien d'heures filtrer par jour ?",
    title: "Duree de filtration : 12h en saison, 24h en canicule",
    answer: "La durée idéale dépend de la température de l'eau, de la température de l'air et de la puissance de votre filtration — il n'y a pas de règle absolue valable pour tout le monde.\n\nMais en pratique :\n• En saison normale : 12 heures par jour est un idéal\n• En période de canicule : 24h/24 — pas d'autre choix, la chaleur accélère le développement des algues et la consommation de chlore\n\nSi votre eau verdissait ou devenait trouble malgré un bon taux de chlore et un pH correct, la durée ou la puissance de filtration est peut-être en cause. Passez nous voir chez BatiAzur, on peut évaluer si votre installation est bien dimensionnée pour votre bassin.",
    followUp: ["Mon eau est verte", "Eau trouble ou laiteuse", "Valeurs idéales piscine"]
  },
  {
    id: "hivernage",
    tags: ["hiver", "hiverner", "hivernage", "fermer", "fermeture", "automne", "gel", "volet", "abri", "actif", "passif"],
    question: "Comment fermer ma piscine pour l'hiver ?",
    title: "Hivernage : actif ou passif selon votre installation",
    answer: "Tout dépend de vos équipements de protection et de vos souhaits.\n\nVous avez un volet ou un abri de piscine ?\n• L'hivernage actif est obligatoire — et c'est celui que BatiAzur recommande à tous.\n\nPourquoi l'hivernage actif est le meilleur choix :\n• Évite le gel des tuyaux et du matériel\n• Facile à mettre en place\n• Permet de conserver une eau limpide et bleue la majeure partie du temps\n• La remise en route au printemps est beaucoup plus simple\n\nSans volet ni abri, un hivernage passif peut être envisagé selon votre région et l'exposition au gel.\n\nDans tous les cas, venez nous voir chez BatiAzur avant la fermeture : on analyse l'eau et on vous prépare les bons produits selon votre type d'hivernage.",
    followUp: ["Ouverture au printemps", "Valeurs idéales piscine"]
  },
  {
    id: "ouverture",
    tags: ["ouvrir", "ouverture", "printemps", "redemarrer", "relancer", "remise en route", "après hiver", "remettre", "route", "demarrage", "debut saison"],
    question: "Remise en route au printemps ?",
    title: "Ouverture : venez voir nos techniciens",
    answer: "La remise en route après l'hiver est une etape clé qui conditionne toute la saison.\n\nPour bien la reussir, le mieux est de passer directement chez BatiAzur : nos techniciens vous accompagnent, analysent votre eau et vous preparent les bons produits selon l'etat de votre piscine et le type d'hivernage que vous avez fait.\n\nContactez-nous au 04 70 34 21 96 ou venez nous voir à Avermes.",
    followUp: ["Hivernage actif ou passif", "Valeurs idéales piscine"]
  },
  {
    id: "valeurs-idéales",
    tags: ["valeur", "valeurs", "idéal", "idéales", "normal", "cible", "objectif", "mesure", "norme", "normes", "tableau", "recommande"],
    question: "Quelles sont les valeurs idéales ?",
    title: "Les valeurs cibles BatiAzur",
    answer: "Voici les valeurs idéales à maintenir pour une eau saine et équilibrée :\n\n• pH : 7,2\n• Chlore : 2,5 ppm\n• TAC : 150 ppm\n• Sel : 5 g/L\n• Stabilisant : 30 ppm\n\nCes valeurs sont les cibles que nous utilisons chez BatiAzur pour analyser votre eau. Si l'un de ces paramètres est hors norme, les autres peuvent être affectes en cascade.\n\nPour une analyse précise de tous vos paramètres, apportez un échantillon d'eau chez BatiAzur — c'est gratuit et ça prend 5 minutes.",
    followUp: ["Corriger le pH", "TAC alcalinité", "Stabilisant"]
  }
];

/* ── FAQ engine ──────────────────────────────────────── */

var STOP_WORDS = new Set([
  "la","le","les","un","une","des","du","de","en","et","ou","au","aux",
  "ce","ça","je","il","tu","on","ma","mon","mes","son","ses","sa","est",
  "pas","que","qui","par","sur","dans","avec","pour","plus","mais","donc",
  "car","ni","si","ne","se","me","te","nous","vous","ils","elles","cela",
  "quoi","comment","pourquoi","quand","quel","quelle","quels","quelles",
  "cest","ya","ya","bo","bah","alors","bon","ah","oh","ok","oui","non",
  "moi","toi","lui","eux","tout","tous","toute","toutes","très","bien",
  "faut","faire","veux","dois","vais","peut","doit","avoir","être","jai",
  "sil","cela","cette","cet","ces","aussi","encore","après","avant","ici"
]);

function normalize(str) {
  return str.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['']/g, " ");
}

function faqScore(entry, words) {
  var score = 0;
  var entryNorm = entry.tags.map(normalize);
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w.length < 2) continue;
    if (STOP_WORDS.has(w)) continue;
    var best = 0;
    for (var j = 0; j < entryNorm.length; j++) {
      var tag = entryNorm[j];
      if (tag === w) { best = 3; break; }                          // exact — stop searching
      if (best < 2 && w.length >= 4) {
        if (tag.startsWith(w) || w.startsWith(tag)) { best = 2; } // prefix (long words only)
        else if (tag.includes(w)) { best = 1; }                   // substring
      }
    }
    score += best;
  }
  return score;
}

function faqSearch(query) {
  var words = normalize(query).split(/\s+/).filter(function(w) { return w.length >= 2; });
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < FAQ_KB.length; i++) {
    var score = faqScore(FAQ_KB[i], words);
    if (score > bestScore) {
      bestScore = score;
      best = FAQ_KB[i];
    }
  }
  return bestScore >= 3 ? best : null;
}

function faqScrollBottom() {
  var scroll = document.querySelector(".app-scroll");
  if (scroll) {
    setTimeout(function() {
      scroll.scrollTop = scroll.scrollHeight;
    }, 60);
  }
}

function faqAddMessage(html, type) {
  var list = document.getElementById("faqMessages");
  if (!list) return;
  var div = document.createElement("div");
  div.className = "faq-msg " + type;
  div.innerHTML = html;
  list.appendChild(div);

  // Bind follow-up chips inside this message
  var chips = div.querySelectorAll(".faq-follow-chip");
  chips.forEach(function(chip) {
    chip.addEventListener("click", function() {
      faqSend(chip.dataset.q);
    });
  });

  faqScrollBottom();
  return div;
}

function faqShowTyping() {
  var list = document.getElementById("faqMessages");
  if (!list) return null;
  var div = document.createElement("div");
  div.className = "faq-typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  list.appendChild(div);
  faqScrollBottom();
  return div;
}

function faqBuildBotHtml(entry) {
  var bodyLines = entry.answer.split("\n").map(function(line) {
    var l = escapeHtml(line);
    if (l.startsWith("• ")) {
      return "<li>" + l.slice(2) + "</li>";
    }
    if (l.match(/^\d+\./)) {
      return "<li>" + l + "</li>";
    }
    if (l === "") return "<br>";
    return l;
  }).join("\n");

  var html = "<strong>" + escapeHtml(entry.title) + "</strong>";
  html += '<div class="faq-body"><ul style="padding:0;margin:0;list-style:none;">' + bodyLines + "</ul></div>";

  // Footer BatiAzur systematique
  html += '<div class="faq-batiazur-cta">';
  html += '<svg viewBox="0 0 20 20"><path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6z"/><circle cx="10" cy="8" r="2"/></svg>';
  html += '<span>Pour une analyse précise de votre eau, rendez-vous chez <strong>BatiAzur</strong> à Avermes — <a href="tel:+33470342196">04 70 34 21 96</a></span>';
  html += "</div>";

  if (entry.followUp && entry.followUp.length) {
    html += '<div class="faq-chips-follow">';
    entry.followUp.forEach(function(q) {
      html += '<button class="faq-follow-chip" data-q="' + escapeHtml(q) + '">' + escapeHtml(q) + "</button>";
    });
    html += "</div>";
  }
  return html;
}

function faqSend(text) {
  text = (text || "").trim();
  if (!text) return;

  // Clear input
  var input = document.getElementById("faqInput");
  if (input) input.value = "";

  // User bubble
  faqAddMessage(escapeHtml(text), "user");

  // Typing indicator
  var typingEl = faqShowTyping();

  // Delay then answer
  var delay = 600 + Math.random() * 400;
  setTimeout(function() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);

    var entry = faqSearch(text);
    if (entry) {
      faqAddMessage(faqBuildBotHtml(entry), "bot");
    } else {
      var noMatch = '<strong>Je n\'ai pas la réponse a cette question</strong>';
      noMatch += '<div class="faq-body">Pour cette question, le mieux est de contacter directement l\'equipe BatiAzur — on vous répondra avec precision.</div>';
      noMatch += '<div class="faq-contact-links">';
      noMatch += '<a href="tel:+33470342196" class="faq-contact-btn faq-contact-tel"><svg viewBox="0 0 20 20"><path d="M2 3a2 2 0 0 1 2-2h2.5a1 1 0 0 1 .97.757l.9 3.6a1 1 0 0 1-.292 1.013L6.5 7.5C7.5 9.5 9.5 12 12 13.5l1.13-1.578a1 1 0 0 1 1.013-.292l3.6.9A1 1 0 0 1 18.5 13.5V16a2 2 0 0 1-2 2C6.268 18 2 10 2 3z"/></svg>04 70 34 21 96</a>';
      noMatch += '<a href="mailto:bati.azur03@gmail.com?subject=Question%20depuis%20BatiAzur%20Analyse" class="faq-contact-btn faq-contact-mail"><svg viewBox="0 0 20 20"><path d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm2 0v.511l6 3.6 6-3.6V4H4zm0 2.044V16h12V6.044l-6 3.6-6-3.6z"/></svg>bati.azur03@gmail.com</a>';
      noMatch += '<a href="https://www.google.com/maps/search/?api=1&query=Bati%20Azur%2C%20Les%20Cailles%2C%20route%20de%20Saint%20Ennemond%2C%2003000%20AVERMES" target="_blank" rel="noopener" class="faq-contact-btn faq-contact-map"><svg viewBox="0 0 20 20"><path d="M10 2a6 6 0 0 1 6 6c0 4-6 10-6 10S4 12 4 8a6 6 0 0 1 6-6zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>Nous trouver</a>';
      noMatch += '</div>';
      faqAddMessage(noMatch, "bot nomatch");
    }
  }, delay);
}

function faqInit() {
  var welcome = '<strong>Bonjour, je suis l\'assistant BatiAzur.</strong><div class="faq-body">Je réponds à vos questions sur l\'entretien de votre piscine : traitements, produits, désordres de l\'eau et dosages.<br><br>Tapez votre question ou choisissez un sujet ci-dessus.</div>';
  faqAddMessage(welcome, "bot");

  // Bind suggestion chips
  $all("#faqChips .faq-chip").forEach(function(chip) {
    chip.addEventListener("click", function() {
      faqSend(chip.dataset.q);
    });
  });

  // Input send
  var input = document.getElementById("faqInput");
  var sendBtn = document.getElementById("faqSend");

  if (input) {
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        faqSend(input.value);
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", function() {
      faqSend(input ? input.value : "");
    });
  }
}

/* ── Events ──────────────────────────────────────────── */

function bindEvents() {
  $all("[data-go]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      press(btn);
      showPage(btn.dataset.go);
    });
  });

  $all(".tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      press(tab);
      showPage(tab.dataset.page);
    });
  });

  $all("[data-shape]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      state.shape = btn.dataset.shape;
      setActiveButton("[data-shape]", "shape", state.shape);
      updateVolumeFields();
      press(btn);
    });
  });

  $all("[data-floor]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      state.floor = btn.dataset.floor;
      setActiveButton("[data-floor]", "floor", state.floor);
      updateVolumeFields();
      press(btn);
    });
  });

  $all("[data-param]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      state.param = btn.dataset.param;
      setActiveButton("[data-param]", "param", state.param);
      renderParamFields();
      setResult("doseResult", "En attente", "Renseigne le volume et les valeurs, puis appuie sur Calculer le dosage.");
      press(btn);
    });
  });

  var calcVol = document.getElementById("calculateVolume");
  if (calcVol) calcVol.addEventListener("click", function(e) { press(e.currentTarget); calculateVolume(); });

  var calcDose = document.getElementById("calculateDose");
  if (calcDose) calcDose.addEventListener("click", function(e) { press(e.currentTarget); calculateDose(); });

  var copyBtn = document.getElementById("copyResult");
  if (copyBtn) {
    copyBtn.addEventListener("click", async function(e) {
      press(e.currentTarget);
      try {
        await navigator.clipboard.writeText(state.lastResultText || "Aucun résultat calcule.");
        copyBtn.classList.add("is-done");
        copyBtn.textContent = "Copie !";
        setTimeout(function() {
          copyBtn.classList.remove("is-done");
          copyBtn.textContent = "Copier le résultat";
        }, 2200);
      } catch (err) {}
    });
  }

  var shareHandler = async function(e) {
    press(e.currentTarget);
    var shareData = {
      title: "BatiAzur Analyse",
      text: "Application BatiAzur Analyse : volume, dosage et conseils piscine.",
      url: window.location.origin + window.location.pathname
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(shareData.url);
    } catch (err) {}
  };
  var shareApp = document.getElementById("shareApp");
  if (shareApp) shareApp.addEventListener("click", shareHandler);
  var shareAppHome = document.getElementById("shareAppHome");
  if (shareAppHome) shareAppHome.addEventListener("click", shareHandler);
}

function startSplash() {
  var splash = document.getElementById("splashScreen");
  var app = document.querySelector(".app");
  window.setTimeout(function() {
    if (app) app.classList.add("is-ready");
    if (splash) splash.classList.add("is-hidden");
  }, 1150);
  window.setTimeout(function() {
    if (splash) splash.remove();
  }, 2050);
}

document.addEventListener("DOMContentLoaded", function() {
  startSplash();
  bindEvents();
  updateVolumeFields();
  renderParamFields();
  syncVolumeToDose();
  loadNews();
});
