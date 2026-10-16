const button = document.getElementById("motion-toggle");
button.addEventListener("click", () => {
  const paused = document.body.classList.toggle("motion-paused");
  button.setAttribute("aria-pressed", String(paused));
  button.textContent = paused ? "Play animation" : "Pause animation";
});
for (const pattern of document.querySelectorAll(".pattern"))
  for (let i = 0; i < 16; i++) {
    if ([3, 6, 9, 12].includes(i)) {
      const space = document.createElement("span");
      pattern.append(space);
    } else pattern.append(document.createElement("i"));
  }
