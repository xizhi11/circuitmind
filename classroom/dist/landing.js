'use strict';

(() => {
  const landing = $('landing');
  const workbench = $('workbench-shell');
  const resume = $('landing-resume');
  const inputButtons = { A: $('landing-input-a'), B: $('landing-input-b') };
  const output = $('landing-output');
  const circuit = Circuit.compile([
    Game.node('A', 'IN', 0, 0),
    Game.node('B', 'IN', 0, 0),
    Game.node('n1', 'NAND', 0, 0),
    Game.node('n2', 'NAND', 0, 0),
    Game.node('Q', 'OUT', 0, 0)
  ], [
    Game.wire('A', 'n1', 0),
    Game.wire('B', 'n1', 1),
    Game.wire('n1', 'n2', 0),
    Game.wire('n1', 'n2', 1),
    Game.wire('n2', 'Q', 0)
  ]);
  const inputs = { A: 0, B: 0 };
  const state = circuit.initial();
  const marks = landing.querySelectorAll('[data-signal]');

  function renderPreview() {
    const result = circuit.evaluate(state, inputs);
    const signals = { ...inputs, n1: result.values.n1[0], Q: result.inputs('Q')[0] };
    output.textContent = 'Q = ' + signals.Q;
    output.dataset.high = String(signals.Q === 1);
    for (const mark of marks) mark.dataset.high = String(signals[mark.dataset.signal] === 1);
    for (const [id, button] of Object.entries(inputButtons)) {
      button.querySelector('span').textContent = inputs[id];
      button.setAttribute('aria-pressed', String(inputs[id] === 1));
    }
  }
  for (const [id, button] of Object.entries(inputButtons)) {
    button.addEventListener('click', () => {
      inputs[id] = 1 - inputs[id];
      renderPreview();
    });
  }
  renderPreview();
  $('landing-tutorial').onclick = () => openTutorial('wiring');

  function courseLevel() {
    const last = Game.levels.find(item => item.id === learningLevelId);
    return last && !locked(last) ? last : firstAvailable();
  }

  function renderRoute() {
    const opening = location.hash === '#workbench';
    resume.textContent = saved[courseLevel().id] || Object.keys(completed).length ? '继续学习' : '开始学习';
    if (opening === !workbench.hidden) return;
    workbench.hidden = !opening;
    landing.hidden = opening;
    if (opening) {
      if (!hasOpenedWorkbench) $('fit').click();
      hasOpenedWorkbench = true;
    } else {
      if (level.demo === 'lander' && studio) studio.keys = 0;
      stop();
    }
    window.scrollTo(0, 0);
    $(opening ? 'title' : 'landing-title').focus({ preventScroll: true });
  }

  let hasOpenedWorkbench = false;

  function enterWorkbench() {
    location.hash = 'workbench';
    renderRoute();
  }

  workbenchReady.then(() => {
    renderRoute();
    window.addEventListener('hashchange', renderRoute);
    $('landing-return').onclick = () => {
      location.hash = '';
      renderRoute();
    };
    $('landing-enter').onclick = enterWorkbench;
    resume.onclick = () => {
      enterWorkbench();
      const lesson = courseLevel();
      if (level.id !== lesson.id) openLevel(lesson.id);
    };
    $('landing-build').onclick = $('landing-lab').onclick = () => {
      enterWorkbench();
      if (level.id !== 'sandbox') openLevel('sandbox');
    };
    $('landing-route').onclick = () => {
      enterWorkbench();
      $('home').click();
    };
    $('landing-workshop').onclick = () => {
      enterWorkbench();
      $('workshop').click();
    };
    for (const id of ['landing-enter','landing-resume','landing-build','landing-route','landing-lab','landing-workshop']) {
      $(id).disabled = false;
    }
  });
})();
