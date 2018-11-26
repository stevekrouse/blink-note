let editorElement;
let errorElement;

const utils = {
  range: n => [...Array(n)].map((_, i) => i),
  debounce: (func, time) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func(...args)
      }, time)
    }
  }
}

const editor = {
  getText: () => editorElement.innerHTML,
  
  setText: text => {
    editorElement.innerHTML = text;
  }
}

const storage = {
  setText: text => {
    let splittedText = storage.splitText(text);
    chrome.storage.sync.set(splittedText, () => {
      if (chrome.runtime.lastError) {
        title.setState('Error');
        console.log(chrome.runtime.lastError)
      } else {
        title.setState('Saved');
      }
    }); 
  },
  
  getText: () => 
    new Promise(function(resolve) {
      chrome.storage.sync.get(null, items => {
        resolve(items);
      });
    }).then(storage.joinText),
  
  splitText: text => {
    let splittedText = {};
    storage.splitKeys().forEach(i => {
      splittedText['text' + i] = text.substring(i * storage.QUOTA_BYTES_PER_ITEM, (i + 1) * storage.QUOTA_BYTES_PER_ITEM);
    });
    return splittedText;
  },
  
  joinText: splittedText => storage.splitKeys().map(i => splittedText['text' + i]).filter(t => t).join(""),
  
  splitKeys: () => utils.range(storage.QUOTA_BYTES / storage.QUOTA_BYTES_PER_ITEM),
  
  // temporarily set to 5k until split on accurate byte count
  QUOTA_BYTES_PER_ITEM: 5000, // chrome.storage.sync.QUOTA_BYTES_PER_ITEM is 8,192
  
  // temporarily set to 50k until split on accurate byte count
  QUOTA_BYTES: 50000 // chrome.storage.sync.QUOTA_BYTES is 102,400
}

const title =  {
  // state: 'Saved', 'Saving', 'Error'
  setState: state => {
    title.state = state; 
    title.update();
  },
  setCharacterLength: length => {
    title.charLength = length
    title.update();
  },
  update: () => {
    let chars = title.charLength ? `(${title.charLength +"/" + storage.QUOTA_BYTES})` : ''
    document.title = `${title.state} - BlinkNote ${chars}`;  
  }
}

const init = () => {
  editorElement = document.querySelector('#c');
  errorElement = document.querySelector("#error");
  
  // mock chrome.storage.sync to work with localStorage if not embedded in chrome extension
  if (!chrome.storage) {
    chrome.storage = {
      sync: {
        get: (keys, callback) => {
          callback(localStorage)
        },
        set: (obj, callback) => {
          Object.keys(obj).forEach(key => localStorage.setItem(key, obj[key]))
          callback();
        },
        QUOTA_BYTES_PER_ITEM: 8192,
        QUOTA_BYTES: 102400
      },
      onChanged: {
        addListener: (func) => {
          window.addEventListener("storage", () => func(null, 'sync'))
        }
      }
    }
  }
  
  const editorStyleChanges = () => { 
    // increase font size of lines beginning in hashtag, animatedly
    ([].slice.call(editorElement.querySelectorAll('*')).map(e => [e, e.innerText]).map(([e, text]) => [e, text.match(/^(#+)\s.*$/)]).filter(([e, m]) => m).map(([e, m]) => [e, m[1]]).forEach(([e,m]) => {e.style.transition = "font-size 0.5s cubic-bezier(0, 1.03, 1, 1) 0s"; e.style.fontSize = (30 - (3*m.length)) || 3}));
    
    // put error on the screen if the total text length is greater than the limit
    // the limit should be 100k but this is until we can get an accurate byte count
    errorElement.style.display = editor.getText().length > 50000 ? 'block' : 'none';
  };
  editorStyleChanges();
  editorElement.addEventListener('input', editorStyleChanges);
  
  title.setState('Saved')
  storage.getText().then(text => {
    editor.setText(text)
    title.setCharacterLength(text.length)
  })
  
  // save changes and update title char text length
  editorElement.addEventListener('keyup', (e) => { 
    title.setState('Saving');
    editorChangeHandler();
  });
  const editorChangeHandler = utils.debounce(() => {
    let editorText = editor.getText();
    title.setCharacterLength(editorText.length);
    storage.setText(editorText)
  });

  // propogate changes from other tabs to this one
  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'sync') {
      let editorText = editor.getText()
      let storageText = await storage.getText()
      if (editorText !== storageText) {
        title.setCharacterLength(storageText.length);
        editor.setText(storageText)
        title.setState('Saved');
      }
    }
  });
  
  // warns you about leaving before save
  window.onbeforeunload = function() {
    return title.state === 'Saved' ? null : true;
  }
}

window.addEventListener('load', init);