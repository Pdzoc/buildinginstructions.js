'use strict';

/**
   Operations:
   - modify step rotation: type[normal,ABS,REL,END], x, y, z
   - add step
   - remove step
   - dissolve sub model
   - save
   - Move parts to previous/next step
   - Move parts to new previous/next step
 */
LDR.StepEditor = function(loader, builder, onChange) {
    if(!onChange) {
        throw "Missing callback for step changes!";
    }
    this.loader = loader;
    this.builder = builder;
    this.onChange = onChange;
    this.onStepSelectedListeners = [];

    // Current state variables:
    this.part;
    this.stepIndex;
    this.step;
    
    // Private function to make it easier to create GUI components:
    this.makeEle = function(parent, type, cls, onclick, innerHTML) {
        var ret = document.createElement(type);
        parent.appendChild(ret);
        if(cls) {
            ret.setAttribute('class', cls);
        }
        if(onclick) {
            ret.addEventListener('click', onclick);
        }
        if(innerHTML) {
            ret.innerHTML = innerHTML;
        }
        return ret;
    }
}

LDR.StepEditor.prototype.updateCurrentStep = function() {
    var [part, stepIndex] = this.builder.getCurrentPartAndStepIndex();
    this.part = part;
    this.stepIndex = stepIndex;
    this.step = part.steps[stepIndex];
    this.onStepSelectedListeners.forEach(listener => listener());
}

LDR.StepEditor.prototype.createGuiComponents = function(parentEle) {
    this.createRotationGuiComponents(parentEle);
    // TODO Other groups of GUI components: For moving parts (to next), creating and removing steps, dissolving sub-model

    var self = this;
    
    var saveEle;
    function save() {
        var fileContent = self.loader.toLDR();
        saveEle.innerHTML = 'Saving...';
        $.ajax({
                url: 'ajax/save.htm',
                type: 'POST',
                data: {model: 1, content: fileContent},
                dataType: "text",
                success: function(result) {
                    saveEle.innerHTML = 'SAVE ALL';
                    console.dir(result);
                },
                error: function(xhr, status, error_message) {
                    saveEle.innerHTML = 'ERROR! PRESS TO SAVE AGAIN';
                    console.dir(xhr);
                    console.warn(status);
                    console.warn(error_message);
                }
            });
    }
    var saveParentEle = this.makeEle(parentEle, 'span', 'editor_control');
    saveEle = this.makeEle(saveParentEle, 'button', 'editor_button', save, 'SAVE ALL');
    this.updateCurrentStep();
}

LDR.StepEditor.prototype.createRotationGuiComponents = function(parentEle) {
    var self = this, Ele, Normal, Rel, Abs, End, X, Y, Z;
    function propagate(rot) {
        for(var i = self.stepIndex+1; i < self.part.steps.length; i++) {
            var s = self.part.steps[i];
            if(!THREE.LDRStepRotation.equals(self.step.rotation, s.rotation)) {
                break; // Only replace those 
            }
            s.rotation = rot ? rot.clone() : null;
        }
        self.step.rotation = rot; // Update starting step.
        self.onChange();
    }
    function makeNormal() { // Copy previous step rotation, or set to null if first step.
        propagate(self.stepIndex === 0 ? null : self.part.steps[self.stepIndex-1].rotation);
    }
    function makeRel() { 
        var rot = self.step.rotation ? self.step.rotation.clone() : new THREE.LDRStepRotation(0, 0, 0, 'REL');
        rot.type = 'REL';
        propagate(rot);
    }
    function makeAbs() {
        var rot = self.step.rotation ? self.step.rotation.clone() : new THREE.LDRStepRotation(0, 0, 0, 'ABS');
        rot.type = 'ABS';
        propagate(rot);
    }
    function makeEnd() {
        propagate(null);
    }

    function setXYZ(e) {
        e.stopPropagation();
        var rot = self.step.rotation ? self.step.rotation.clone() : new THREE.LDRStepRotation(0, 0, 0, 'REL');
        var x = parseFloat(X.value);
        var y = parseFloat(Y.value);
        var z = parseFloat(Z.value);
        if(isNaN(x) || isNaN(y) || isNaN(z) || 
           X.value !== ''+x || Y.value !== ''+y || Z.value !== ''+z) {
            return;
        }

        rot.x = x;
        rot.y = y;
        rot.z = z;
        propagate(rot);
    }

    Ele = this.makeEle(parentEle, 'span', 'editor_control');
    function makeRotationRadioButton(value, onClick) {
        var button = self.makeEle(Ele, 'input', 'editor_radio_button', onClick);

        var label = self.makeEle(Ele, 'label', 'editor_radio_label', null, value);
        label.setAttribute('for', value);

        button.setAttribute('type', 'radio');
        button.setAttribute('id', value);
        button.setAttribute('name', 'rot_type');
        //button.setAttribute('value', 'false');
        return button;
    }
    Normal = makeRotationRadioButton('STEP', makeNormal);
    Rel = makeRotationRadioButton('REL', makeRel);
    Abs = makeRotationRadioButton('ABS', makeAbs);
    End = makeRotationRadioButton('END', makeEnd);

    function makeXYZ(type) {
        self.makeEle(Ele, 'label', 'editor_label', null, type);
        var ret = self.makeEle(Ele, 'input', 'editor_input', setXYZ);
        ret.addEventListener('keyup', setXYZ);
        ret.addEventListener('keydown', e => e.stopPropagation());
        return ret;
    }
    X = makeXYZ('X');
    Y = makeXYZ('Y');
    Z = makeXYZ('Z');

    function onStepSelected() {
        var rot = self.step.rotation;
        if(!rot) {
            if(self.stepIndex === 0 || !self.part.steps[self.stepIndex-1].rotation) {
                Normal.checked = true;
                rot = new THREE.LDRStepRotation(0, 0, 0, 'REL');
            }
            else {
                // Previous step had a rotation, so this step must be an end step:
                End.checked = true;
            }
        }
        else { // There is currently a rotation:
            if(self.stepIndex === 0 ? (rot.type === 'REL' && rot.x === 0 && rot.y === 0 && rot.z === 0) :
               THREE.LDRStepRotation.equals(rot, self.part.steps[self.stepIndex-1].rotation)) {
                Normal.checked = true;
            }
            else if(rot.type === 'REL') {
                Rel.checked = true;
            }
            else { // rot.type === 'ABS' as 'ADD' is unsupported.
                Abs.checked = true;
            }
        }

        if(rot) {
            X.value = rot.x;
            Y.value = rot.y;
            Z.value = rot.z;
            X.disabled = Y.disabled = Z.disabled = false;
        }
        else {
            X.value = Y.value = Z.value = "---";
            X.disabled = Y.disabled = Z.disabled = true;
        }
    }
    this.onStepSelectedListeners.push(onStepSelected);
}
