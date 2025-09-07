const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const Store = require('electron-store')
const dirTree = require("directory-tree")
const sanitizeHtml = require('sanitize-html')
const url = require('url')
const { v4: uuidv4 } = require('uuid')
const axios = require('axios').default

// Initialize store
const store = new Store()
Store.initRenderer()

// Function to get user data directory path
function getUserDataPath() {
  const currentSession = store.get('currentSession') || {}
  const userId = currentSession.userId || 'anonymous'
  const userDataPath = path.join(app.getPath('userData'), 'user_data', userId)
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  
  return userDataPath
}

function getUserDataFile() {
  return path.join(getUserDataPath(), 'user_data.json')
}

function loadUserData() {
  const defaultUserData = {
    userId: undefined,
    highlights: {},
    usageStats: {},
    progress: null,
    lastUpdated: null
  };

  try {
    const currentSession = store.get('currentSession') || {};
    const userId = currentSession.userId || 'anonymous';
    const userDataPath = getUserDataPath(userId);
    const userDataFile = path.join(userDataPath, 'user_data.json');
    
    console.log('\n=== loadUserData() ===');
    console.log(`User ID: ${userId}`);
    console.log(`Data file: ${userDataFile}`);
    console.log(`Session data:`, JSON.stringify(currentSession, null, 2));
    
    // Ensure user directory exists
    if (!fs.existsSync(userDataPath)) {
      console.log(`Creating user data directory: ${userDataPath}`);
      fs.mkdirSync(userDataPath, { recursive: true });
      return { ...defaultUserData, userId };
    }
    
    // Check if user data file exists
    if (fs.existsSync(userDataFile)) {
      try {
        const fileContent = fs.readFileSync(userDataFile, 'utf8');
        if (!fileContent.trim()) {
          console.log('User data file is empty, returning default data');
          return { ...defaultUserData, userId };
        }
        
        const data = JSON.parse(fileContent);
        console.log('Raw data from file:', JSON.stringify({
          hasUserId: !!data.userId,
          hasHighlights: !!data.highlights,
          hasUsageStats: !!data.usageStats,
          hasProgress: !!data.progress,
          dataKeys: Object.keys(data)
        }, null, 2));
        
        // Ensure we have all required fields with proper defaults
        const cleanData = {
          ...defaultUserData,
          // Only include data properties that are valid
          ...(data.userId && { userId: data.userId }),
          highlights: data.highlights && typeof data.highlights === 'object' ? data.highlights : {},
          usageStats: data.usageStats && typeof data.usageStats === 'object' ? data.usageStats : {},
          progress: data.progress && typeof data.progress === 'object' ? data.progress : null,
          lastUpdated: data.lastUpdated || new Date().toISOString()
        };
        
        // Ensure the user ID matches the current session
        if (cleanData.userId !== userId) {
          console.warn(`User ID mismatch: expected ${userId}, got ${cleanData.userId}. Updating to current user.`);
          cleanData.userId = userId;
        }
        
        console.log('Successfully loaded and validated user data:', JSON.stringify({
          userId: cleanData.userId,
          highlightsCount: Object.keys(cleanData.highlights || {}).length,
          usageStatsCount: Object.keys(cleanData.usageStats || {}).length,
          hasProgress: !!cleanData.progress,
          lastUpdated: cleanData.lastUpdated
        }, null, 2));
        
        return cleanData;
      } catch (error) {
        console.error('Error parsing user data:', error);
        // On error, back up the corrupted file and return default data
        try {
          const backupFile = `${userDataFile}.corrupted.${Date.now()}`;
          console.log(`Backing up corrupted file to: ${backupFile}`);
          fs.copyFileSync(userDataFile, backupFile);
          console.log('Original file preserved, backup created at:', backupFile);
        } catch (e) {
          console.error('Failed to back up corrupted user data file:', e);
        }
        return { ...defaultUserData, userId, lastUpdated: new Date().toISOString() };
      }
    } else {
      console.log('No existing user data file found, creating default data');
      const newUserData = { ...defaultUserData, userId, lastUpdated: new Date().toISOString() };
      // Save the default data to create the file
      fs.writeFileSync(userDataFile, JSON.stringify(newUserData, null, 2), 'utf8');
      console.log('Created new user data file with default values');
      return newUserData;
    }
  } catch (error) {
    console.error('Error in loadUserData:', error);
    const currentSession = store.get('currentSession') || {};
    const userId = currentSession.userId || 'anonymous';
    return { ...defaultUserData, userId };
  }
}

function saveUserData(data) {
  try {
    console.log('\n=== saveUserData() ===');
    console.log('Incoming data to save:', {
      userId: data.userId,
      hasHighlights: !!data.highlights,
      highlightsCount: data.highlights ? Object.keys(data.highlights).length : 0,
      hasUsageStats: !!data.usageStats,
      usageStatsCount: data.usageStats ? Object.keys(data.usageStats).length : 0,
      hasProgress: !!data.progress,
      progressType: data.progress ? typeof data.progress : 'none',
      dataKeys: Object.keys(data)
    });
    
    const currentSession = store.get('currentSession') || {};
    const userId = data.userId || currentSession.userId || 'anonymous';
    
    // Ensure we have a valid user ID
    if (!userId) {
      console.error('Cannot save data: No user ID available');
      console.error('Data being saved:', data);
      console.error('Current session:', currentSession);
      return false;
    }
    
    // Get the user's data directory and file path
    const userDataPath = getUserDataPath(userId);
    const userDataFile = path.join(userDataPath, 'user_data.json');
    
    console.log(`Saving to: ${userDataFile}`);
    console.log('Ensuring directory exists:', userDataPath);
    
    // Ensure user directory exists
    if (!fs.existsSync(userDataPath)) {
      console.log(`Creating directory: ${userDataPath}`);
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    // Load existing data if available
    let existingData = {};
    if (fs.existsSync(userDataFile)) {
      try {
        const fileContent = fs.readFileSync(userDataFile, 'utf8');
        console.log(`Existing file content (${fileContent.length} bytes):`, fileContent.substring(0, 200) + (fileContent.length > 200 ? '...' : ''));
        if (fileContent.trim()) {
          existingData = JSON.parse(fileContent);
          console.log('Successfully parsed existing data:', {
            existingUserId: existingData.userId,
            highlightsCount: existingData.highlights ? Object.keys(existingData.highlights).length : 0,
            hasProgress: !!existingData.progress
          });
          console.log('Loaded existing data:', {
            highlights: Object.keys(existingData.highlights || {}).length,
            usageStats: Object.keys(existingData.usageStats || {}).length,
            progress: existingData.progress ? 'exists' : 'none'
          });
        }
      } catch (error) {
        console.error('Error loading existing user data:', error);
        // Continue with empty data if we can't load existing data
      }
    }
    
    // Prepare data to save - only update what's provided in the data object
    const dataToSave = {
      // Start with existing data
      userId: existingData.userId || userId,
      highlights: { ...(existingData.highlights || {}) },
      usageStats: { ...(existingData.usageStats || {}) },
      progress: null, // Initialize as null, will be set if progress exists
      lastUpdated: new Date().toISOString()
    };
    
    // Only update what's provided in the data object
    if (data.highlights) {
      dataToSave.highlights = { ...data.highlights };
    }
    
    if (data.usageStats) {
      dataToSave.usageStats = { ...data.usageStats };
    }
    
    // Handle progress - ensure we always have a valid progress structure
    dataToSave.progress = {
      stats: {
        total: 0,
        correct: 0,
        incorrect: 0,
        flagged: 0
      },
      tagbuckets: {}
    };
    
    // If we have new progress data, merge it
    if (data.progress && data.progress.stats) {
      // Only keep non-zero stats
      dataToSave.progress.stats = {
        total: Math.max(0, parseInt(data.progress.stats.total) || 0),
        correct: Math.max(0, parseInt(data.progress.stats.correct) || 0),
        incorrect: Math.max(0, parseInt(data.progress.stats.incorrect) || 0),
        flagged: Math.max(0, parseInt(data.progress.stats.flagged) || 0)
      };
      
      // Only keep non-empty tagbuckets
      if (data.progress.tagbuckets && Object.keys(data.progress.tagbuckets).length > 0) {
        dataToSave.progress.tagbuckets = { ...data.progress.tagbuckets };
      }
    } else if (existingData.progress && existingData.progress.stats) {
      // Fall back to existing progress if no new progress provided
      dataToSave.progress = {
        stats: {
          total: Math.max(0, parseInt(existingData.progress.stats.total) || 0),
          correct: Math.max(0, parseInt(existingData.progress.stats.correct) || 0),
          incorrect: Math.max(0, parseInt(existingData.progress.stats.incorrect) || 0),
          flagged: Math.max(0, parseInt(existingData.progress.stats.flagged) || 0)
        },
        tagbuckets: { ...(existingData.progress.tagbuckets || {}) }
      };
    }
    
    console.log('Merged data to save:', {
      userId: dataToSave.userId,
      highlights: Object.keys(dataToSave.highlights || {}).length,
      usageStats: Object.keys(dataToSave.usageStats || {}).length,
      progress: dataToSave.progress ? 'exists' : 'none',
      lastUpdated: dataToSave.lastUpdated
    });
    
    // Convert the data to JSON string
    const dataToWrite = JSON.stringify(dataToSave, null, 2);
    console.log(`Writing ${dataToWrite.length} bytes to ${userDataFile}`);
    
    try {
      // Write to file
      fs.writeFileSync(userDataFile, dataToWrite, 'utf8');
      
      // Verify the file was written correctly
      const fileContent = fs.readFileSync(userDataFile, 'utf8');
      console.log(`Successfully wrote ${fileContent.length} bytes to file`);
      
      const writtenData = JSON.parse(fileContent);
      console.log('Verifying written data:', {
        fileSize: fileContent.length,
        userId: writtenData.userId,
        expectedUserId: userId,
        highlightsCount: writtenData.highlights ? Object.keys(writtenData.highlights).length : 0,
        hasProgress: !!writtenData.progress
      });
      
      if (writtenData.userId !== userId) {
        console.error('ERROR: User ID mismatch after writing to file!');
        console.error('Expected:', userId);
        console.error('Got:', writtenData.userId);
        console.error('Full written data:', JSON.stringify(writtenData, null, 2));
      }
      
      return true;
    } catch (error) {
      console.error('Error writing or verifying user data:', error);
      throw new Error(`Failed to save user data: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in saveUserData:', error);
    return false;
  }
}

//GA tracking
let uuid
if( store.has('uuid') ) {
  uuid = store.get('uuid')
} else {
  uuid = uuidv4()
  store.set('uuid', uuid)
}
function gaPageview(pagename) {
  const payload = new URLSearchParams({
      v: 1,
      cid: uuid,
      tid: 'UA-171633786-3',
      t: 'pageview',
      dp: `/${pagename}.html`,
      dt: pagename
  }).toString()
  axios.post('https://google-analytics.com/collect', payload)
}
function gaEvent(eventname) {
  const payload = new URLSearchParams({
    v: 1,
    cid: uuid,
    tid: 'UA-171633786-3',
    t: 'event',
    ec: eventname,
    ea: eventname
  }).toString();
  axios.post('https://google-analytics.com/collect', payload);
}
ipcMain.on("answerselect", (e)=>{
  gaEvent('answerselect')
})

let win
let sendinfo
folderpaths = []
currentpath = ''
qbankinfo = {}
doiquit = false

function getUserDataPath(userId) {
  // If no userId is provided, try to get it from the current session
  if (!userId) {
    const currentSession = store.get('currentSession') || {};
    userId = currentSession.userId || 'anonymous';
  }
  
  const userDataPath = path.join(app.getPath('userData'), 'user_data', userId);
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  return userDataPath;
}

if (store.has('folderpaths')) {
  folderpaths = (store.get(folderpaths))['folderpaths']
}

function createWindow () {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  })

  win.setTitle('Quail')
  sendinfo = function() {
    win.webContents.send('folderpaths', folderpaths)
  }
  win.webContents.on('did-finish-load', () => {
    sendinfo()
  })
  win.loadFile('index.html')
  gaPageview('index')
}

function appquit() {
  // Only save data if we have a valid qbankinfo object
  if (qbankinfo && qbankinfo.userId) {
    const userData = {
      userId: qbankinfo.userId,
      highlights: qbankinfo.highlights || {},
      usageStats: qbankinfo.usageStats || {},
      progress: qbankinfo.progress || {}
    };
    saveUserData(userData);
  }
  win.destroy()
  app.quit()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  const { powerMonitor } = require('electron')
  function considerPause() {
    const currentURL = win.webContents.getURL()
    if(currentURL.endsWith('examview.html')) {
      win.webContents.send('dopause')
    } else {
      if(doiquit) {
        appquit()
      }
    }
  }

  powerMonitor.on('suspend', () => { considerPause() })
  powerMonitor.on('lock-screen', () => { considerPause() })
  powerMonitor.on('user-did-resign-active', () => { considerPause() })
  powerMonitor.on('shutdown', (e) => {
    e.preventDefault()
    doiquit = true
    considerPause()
  })
  win.on('close', (e) => {
    e.preventDefault()
    doiquit = true
    considerPause()
  })
  win.on('session-end', (e) => {
    e.preventDefault()
    doiquit = true
    considerPause()
  })

  app.on('before-quit', () => {
    // This is now handled by appquit
  });
})

function processNewBank(pathgiven) {

  win.webContents.send('addhtml', `<div>Reading folder: ${pathgiven}</div><br />`)

  tree = dirTree(pathgiven, {extensions:/\.html$/})

  qidobj = {}
  nosolution = []

  if(! fs.existsSync(pathgiven + '/index.json')) {
    for( const c of tree.children ) {
      if(c.type=='file' && c.name.endsWith('-q.html')) {
        solutionfile = c.name.split('-')[0] + '-s.html'
        if( fs.existsSync(pathgiven + '/' + solutionfile) ) {
          qidobj[c.name.split('-')[0]] = {0: 'General'}
        } else {
          nosolution.push(c.name.split('-')[0])
        }
      }
    }
  } else {
    qidobj = JSON.parse(fs.readFileSync(pathgiven+'/index.json'))
  }

  if( Object.keys(qidobj).length > 0 ) {

    if(! fs.existsSync(pathgiven + '/index.json')) {
      //write index
      fs.writeFile(pathgiven + '/index.json', JSON.stringify(qidobj), (err) => {
           if(err) { console.log(err)}
           else { console.log(`Generated index.json with ${Object.keys(qidobj).length} questions`) }
      })
      //write tag names
      tagnamesobj = {
        'tagnames' : {
          0: 'General'
        }
      }
      fs.writeFile(pathgiven + '/tagnames.json', JSON.stringify(tagnamesobj), (err) => {
           if(err) { console.log(err)}
           else { console.log(`Generated tagnames.json`) }
      })
      win.webContents.send('addhtml', `<div style="${nosolution.length>0 ? 'color: red;' : ''}">Index file automatically generated - ${Object.keys(qidobj).length} questions included.${nosolution.length>0 ? ' Question IDs ' + nosolution.toString().replaceAll(',',', ') + ' were omitted as no corresponding solution file was found.' : '' }</div><br />`)
    } else {
      win.webContents.send('addhtml', `<div>Index file found with ${Object.keys(qidobj).length} questions.</div><br />`)
    }

    //write groups if no file
    if(! fs.existsSync(pathgiven + '/groups.json')) {
      groupsobj = {}
      fs.writeFile(pathgiven + '/groups.json', JSON.stringify(groupsobj), (err) => {
           if(err) { console.log(err)}
           else {
             console.log(`Generated groups.json`)
           }
      })
      win.webContents.send('addhtml', `<div>Automatically generated empty groups.json file</div><br />`)
    } else {
      win.webContents.send('addhtml', `<div>Found existing groups.json file</div><br />`)
    }

    //write panes if no file
    if(! fs.existsSync(pathgiven + '/panes.json')) {
      panesobj = {}
      fs.writeFile(pathgiven + '/panes.json', JSON.stringify(panesobj), (err) => {
           if(err) { console.log(err)}
           else {
             console.log(`Generated panes.json`)
           }
      })
      win.webContents.send('addhtml', `<div>Automatically generated empty panes.json file</div><br />`)
    } else {
      win.webContents.send('addhtml', `<div>Found existing panes.json file</div><br />`)
    }

    // write choices if no file
    if(! fs.existsSync(pathgiven + '/choices.json')) {
      choicesobj = {}
      problems = false
      prob1str = 'Problem detecting answer choices on QIDs: '
      prob2str = 'Problem detecting correct answer on QIDs: '
      prob3str = 'Correct answer not found in choice list on QIDs: '
      // regexchoice = /\n*[A-Z][ \n]*\)|\n*[A-Z]\./gm
      regexchoice = /^[  \t]*[A-Z][  \n\t]*\)|^[  \t]*[A-Z]\./gm
      regexcorrect = /[Cc]orrect[  \n]*[Aa]nswer[  \n]*[\.:][  \n]*[A-Z]/gm
      for(const thisqid of Object.keys(qidobj)) {
        // console.log('reading: ' + `/${thisqid}-q.html`)
        file = fs.readFileSync(pathgiven+`/${thisqid}-q.html`, 'utf8')
        matchlist = sanitizeHtml(file, {allowedTags:['br'], allowedAttributes:[]}).replace(/<br *\/*>/g, '\n').match(regexchoice)
        choicelist = []
        if(matchlist) {
          for(const choice of matchlist) {
            choicelist.push(choice.match(/[A-Z]/)[0])
          }
        } else {
          problems = true
          prob1str = prob1str + thisqid.toString() + ', '
        }
        // console.log('reading: ' + `/${thisqid}-s.html`)
        file = fs.readFileSync(pathgiven+`/${thisqid}-s.html`, 'utf8')
        matchlist = sanitizeHtml(file, {allowedTags:[], allowedAttributes:[]}).match(regexcorrect)
        if(matchlist) {
          correctstr = matchlist[0].substring(matchlist[0].length-1)
        } else {
          problems = true
          prob2str = prob2str + thisqid.toString() + ', '
          correctstr = ''
        }
        if(!choicelist.includes(correctstr) && correctstr!='' && choicelist.length>0) {
          problems = true
          prob3str = prob3str + thisqid.toString() + ', '
        }
        item = {
          'options': choicelist,
          'correct': correctstr
        }
        choicesobj[thisqid] = item
      }
      fs.writeFile(pathgiven + '/choices.json', JSON.stringify(choicesobj), (err) => {
           if(err) { console.log(err)}
           else { console.log(`Generated choices.json with ${Object.keys(choicesobj).length} items`) }
      })
      win.webContents.send('addhtml', `<div>The file 'choices.json' containing answer choices and correct answers was not found, so it is being automatically generated based on the question and solution text. Choices and scoring may be unreliable.</div>`)
      if(problems) {
        win.webContents.send('addhtml', `<div style="color: red;">One or more problems were detected in this process.<br />${prob1str}<br />${prob2str}<br />${prob3str}</div><br />`)
      } else {
        win.webContents.send('addhtml', `<div>No problems were detected in this process.</div><br />`)
      }
    } else {
      win.webContents.send('addhtml', `<div>Found existing choices.json file</div><br />`)
    }

    //handle progress file
    if(fs.existsSync(pathgiven + '/progress.json')) {
      useprog = dialog.showMessageBoxSync(win, {message: 'Progress file found. Continue using progress file, or reset progress?', type: 'question', buttons: ['Use progress file', 'Reset progress'], defaultId: 0})
      if(useprog == 1) {
        fs.unlinkSync(pathgiven + '/progress.json')
        win.webContents.send('addhtml', `<div>Deleted progress.json file - question bank has been reset</div><br />`)
        console.log('Deleted existing progress file')
      } else {
        win.webContents.send('addhtml', `<div>Retained existing progress.json file</div><br />`)
        console.log('Retained existing progress file')
      }
    }

    folderpaths.push(pathgiven)
    store.set('folderpaths', folderpaths)
    // win.webContents.send('folderpaths', folderpaths)

  } else {
    win.webContents.send('addhtml', `<div style="color: red;">Invalid folder - no properly formatted files detected</div><br />`)
  }

  win.webContents.send('addhtml', `<div>Done.</div><br />`)
  win.webContents.send('done')

}

ipcMain.on("load-fixed-dataset", (e, datasetPath) => {
  try {
    console.log('Loading fixed dataset from path:', datasetPath);
    
    // Get or create user session
    let currentSession = store.get('currentSession') || {};
    
    // Ensure we have a user ID
    if (!currentSession.userId) {
      currentSession.userId = uuidv4();
      store.set('currentSession', currentSession);
      console.log('Created new user session with ID:', currentSession.userId);
    }
    
    // Ensure we have a valid path
    if (!datasetPath || typeof datasetPath !== 'string') {
      throw new Error('Invalid dataset path provided');
    }
    
    // Ensure the path exists
    if (!fs.existsSync(datasetPath)) {
      throw new Error(`Dataset path does not exist: ${datasetPath}`);
    }
    
    // Ensure user data directory exists
    const userDataPath = getUserDataPath(currentSession.userId);
    console.log('Using user data path:', userDataPath);
    
    // Set current path and load question bank
    currentpath = datasetPath;
    loadqbank();
    
    // Update UI
    win.loadFile('overview.html');
    const displayKey = currentSession.licenseKey 
      ? currentSession.licenseKey.length > 8 
        ? `${currentSession.licenseKey.substring(0, 4)}...${currentSession.licenseKey.slice(-4)}`
        : currentSession.licenseKey
      : 'Demo';
    win.setTitle(`Quail - ${displayKey}`);
    gaPageview('overview');
    
    console.log('Successfully loaded dataset and updated UI');
  } catch (error) {
    console.error('Error in load-fixed-dataset:', error);
    
    // Send error back to renderer
    if (win && !win.isDestroyed()) {
      win.webContents.send('load-dataset-error', error.message);
    }
    if (win && !win.isDestroyed()) {
      dialog.showErrorBox('Error', 'Failed to load dataset. Please try again.');
    }
  }
})

function loadqbank() {
  try {
    // Get current user info
    const currentSession = store.get('currentSession') || {};
    const userId = currentSession.userId || 'anonymous';
    
    console.log('\n--- loadqbank() ---');
    console.log(`Loading question bank for user: ${userId}`);
    console.log('Current session:', JSON.stringify(currentSession, null, 2));
    
    // Load user data first to ensure we have the latest
    console.log('Loading user data...');
    const loadedUserData = loadUserData();
    
    console.log('\n=== Loaded User Data ===');
    console.log(`User ID: ${loadedUserData.userId}`);
    console.log(`Highlights: ${Object.keys(loadedUserData.highlights || {}).length} items`);
    console.log(`Usage Stats: ${Object.keys(loadedUserData.usageStats || {}).length} items`);
    console.log(`Progress: ${loadedUserData.progress ? 'exists' : 'none'}`);
    
    // Initialize qbankinfo with default values
    qbankinfo = {
      userId: userId,
      progress: {
        tagbuckets: {},
        stats: {
          total: 0,
          correct: 0,
          incorrect: 0,
          flagged: 0
        }
      },
      highlights: {},
      usageStats: {},
      lastUpdated: new Date().toISOString()
    };
    
    // Only merge existing progress if it has valid data
    if (loadedUserData && loadedUserData.progress) {
      console.log('\n=== Merging Progress Data ===');
      
      // Check if we have valid progress data to merge
      const stats = loadedUserData.progress.stats || {};
      const hasNonZeroStats = Object.values(stats).some(val => val > 0);
      const hasTagBuckets = loadedUserData.progress.tagbuckets && 
                          Object.keys(loadedUserData.progress.tagbuckets).length > 0;
      
      if (hasNonZeroStats || hasTagBuckets) {
        // Merge stats if they exist
        if (loadedUserData.progress.stats) {
          qbankinfo.progress.stats = {
            total: Math.max(0, parseInt(stats.total) || 0),
            correct: Math.max(0, parseInt(stats.correct) || 0),
            incorrect: Math.max(0, parseInt(stats.incorrect) || 0),
            flagged: Math.max(0, parseInt(stats.flagged) || 0)
          };
        }
        
        // Merge tagbuckets if they exist
        if (hasTagBuckets) {
          qbankinfo.progress.tagbuckets = { ...loadedUserData.progress.tagbuckets };
        }
      }
    }
    
    // Merge highlights if they exist
    if (loadedUserData.highlights && typeof loadedUserData.highlights === 'object') {
      const highlightCount = Object.keys(loadedUserData.highlights).length;
      if (highlightCount > 0) {
        qbankinfo.highlights = { ...loadedUserData.highlights };
      }
    }
    
    // Merge usageStats if they exist
    if (loadedUserData.usageStats && typeof loadedUserData.usageStats === 'object') {
      const statsCount = Object.keys(loadedUserData.usageStats).length;
      if (statsCount > 0) {
        qbankinfo.usageStats = { ...loadedUserData.usageStats };
      }
    }
    
    // Update lastUpdated timestamp
    qbankinfo.lastUpdated = new Date().toISOString();
    
    // Load the qbank data
    qbankinfo.path = currentpath;
    console.log(`Loading question bank from: ${currentpath}`);
    
    // Load essential files (these are shared across users)
    qbankinfo.index = JSON.parse(fs.readFileSync(path.join(currentpath, 'index.json'), 'utf8'));
    qbankinfo.tagnames = JSON.parse(fs.readFileSync(path.join(currentpath, 'tagnames.json'), 'utf8'));
    qbankinfo.choices = JSON.parse(fs.readFileSync(path.join(currentpath, 'choices.json'), 'utf8'));
    
    // Ensure progress has required structure with correct total count
    if (!qbankinfo.progress.stats) {
      qbankinfo.progress.stats = {
        total: Object.keys(qbankinfo.index || {}).length,
        correct: 0,
        incorrect: 0,
        flagged: 0
      };
    } else {
      // Update total count based on actual questions
      qbankinfo.progress.stats.total = Object.keys(qbankinfo.index || {}).length;
    }
    
    // Set up usage stats handler
    ipcMain.removeAllListeners("update-usage-stats");
    ipcMain.on("update-usage-stats", (e, stats) => {
      qbankinfo.usageStats = { ...qbankinfo.usageStats, ...stats };
      // Save the updated usage stats to user data
      const userData = loadUserData();
      userData.usageStats = qbankinfo.usageStats;
      saveUserData(userData);
      console.log('Updated usage stats for user:', userId);
    });
    
    // Initialize tag buckets
    createTagBuckets();
    loadFolderInfo();
    
    // Set up sendinfo function
    sendinfo = function() {
      if (win && !win.isDestroyed()) {
        win.webContents.send('qbankinfo', qbankinfo);
        const split = url.pathToFileURL(currentpath).toString().split('/');
        const foldername = decodeURIComponent(split[split.length-1]);
        win.setTitle(`Quail - ${foldername}`);
      }
    };
    
    // Send initial data to renderer
    if (sendinfo) sendinfo();
    
    return Object.keys(qbankinfo.index || {});
    
  } catch (error) {
    console.error('Error in loadqbank:', error);
    if (win && !win.isDestroyed()) {
      dialog.showErrorBox('Error', `Failed to load question bank: ${error.message}`);
      win.loadFile('index.html');
    }
    return [];
  }
}

function createTagBuckets() {

  numtags = Object.keys(qbankinfo.tagnames.tagnames).length
  tags=[]
  for (var i=0; i<numtags; i++) {
    tagname = qbankinfo.tagnames.tagnames[i]
    tags.push(tagname)
    qbankinfo.progress.tagbuckets[tagname] = {}
  }

  for (const qid in qbankinfo.index) {
    for(var i=0; i<numtags; i++) {
      subtagname = qbankinfo.index[qid][i]
      if (subtagname in qbankinfo.progress.tagbuckets[tags[i]]) {
        qbankinfo.progress.tagbuckets[tags[i]][subtagname].all.push(qid)
        qbankinfo.progress.tagbuckets[tags[i]][subtagname].unused.push(qid)
      } else {
        qbankinfo.progress.tagbuckets[tags[i]][subtagname] = {
          'all': [qid],
          'unused': [qid],
          'incorrects': [],
          'flagged': []
        }
      }
    }
  }

}

function loadFolderInfo() {

  qbankinfo.path =  currentpath
  qbankinfo.index = JSON.parse(fs.readFileSync(currentpath+'/index.json'))
  qbankinfo.tagnames = JSON.parse(fs.readFileSync(currentpath+'/tagnames.json'))
  qbankinfo.choices = JSON.parse(fs.readFileSync(currentpath+'/choices.json'))
  qbankinfo.groups = JSON.parse(fs.readFileSync(currentpath+'/groups.json'))
  qbankinfo.panes = JSON.parse(fs.readFileSync(currentpath+'/panes.json'))

  if(fs.existsSync(currentpath + '/progress.json')) {
    qbankinfo.progress = JSON.parse(fs.readFileSync(currentpath+'/progress.json'))
  } else {
    numquestions = Object.keys(qbankinfo.index).length
    qbankinfo.progress = {
      'blockhist': {

      },
      'tagbuckets': {

      }
    }
    createTagBuckets()
    fs.writeFile(currentpath + '/progress.json', JSON.stringify(qbankinfo.progress), (err) => {
         if(err)
            console.log(err)
    })
  }

}

ipcMain.on("index-start", (e, clickedpath)=>{
  currentpath = clickedpath
  if(fs.existsSync(currentpath + '/index.json')) {
    loadqbank()
  } else {
    dialog.showMessageBox(win, {message: 'Invalid folder - no index.json file', type:'error'})
  }
})

ipcMain.on("index-delete", (e, path)=>{
  index = folderpaths.indexOf(path)
  folderpaths.splice(index, 1)
  store.set('folderpaths', folderpaths)
  win.webContents.send('folderpaths', folderpaths)
})

ipcMain.on("navto-overview", (e)=>{
  win.loadFile('overview.html')
  gaPageview('overview')
})

ipcMain.on("navto-newblock", (e)=>{
  win.loadFile('newblock.html')
  gaPageview('newblock')
})

ipcMain.on("navto-prevblocks", (e)=>{
  win.loadFile('previousblocks.html')
  gaPageview('previousblocks')
})

ipcMain.on("navto-index", (e)=>{
  sendinfo = function() {
    win.webContents.send('folderpaths', folderpaths)
  }
  win.loadFile('index.html')
  win.setTitle('Quail')
  gaPageview('index')
})

// Handle user logout
ipcMain.on('user-logout', () => {
  // Get current session before clearing
  const currentSession = store.get('currentSession') || {};
  const userId = currentSession.userId || 'anonymous';
  
  console.log(`Logging out user: ${userId}`);
  
  // Clear the session
  store.delete('currentSession');
  
  // Clear any in-memory data
  qbankinfo = null;
  currentpath = '';
  
  console.log('User logged out successfully');
  
  // Send response back to renderer and navigate to login page
  if (win && !win.isDestroyed()) {
    win.webContents.send('logout-confirmed');
    win.loadFile('index.html');
    win.setTitle('Quail');
  }
});

// bucket helper functions
function isInBucket(thisqid, bucket) {
  return qbankinfo.progress.tagbuckets[qbankinfo.tagnames.tagnames[0]][qbankinfo.index[thisqid][0]][bucket].includes(thisqid)
}
function addToBucket(thisqid, bucket) {
  numtags = Object.keys(qbankinfo.tagnames.tagnames).length
  for(var i=0; i<numtags; i++) {
    qbankinfo.progress.tagbuckets[qbankinfo.tagnames.tagnames[i]][qbankinfo.index[thisqid][i]][bucket].push(thisqid)
  }
}
function removeFromBucket(thisqid, bucket) {
  numtags = Object.keys(qbankinfo.tagnames.tagnames).length
  for(var i=0; i<numtags; i++) {
    var index = qbankinfo.progress.tagbuckets[qbankinfo.tagnames.tagnames[i]][qbankinfo.index[thisqid][i]][bucket].indexOf(thisqid);
    if (index > -1) {
      qbankinfo.progress.tagbuckets[qbankinfo.tagnames.tagnames[i]][qbankinfo.index[thisqid][i]][bucket].splice(index, 1);
   }
  }
}

qpoolSettingEquiv = {
  'btn-qpool-unused': 'Unused',
  'btn-qpool-incorrects': 'Incorrects',
  'btn-qpool-flagged': 'Flagged',
  'btn-qpool-all': 'All',
  'btn-qpool-custom': 'Custom'
}
ipcMain.on("startblock", (e, blockqlist)=>{
  for(const thisqid of blockqlist) {
    if( isInBucket(thisqid, 'unused') ) {
      removeFromBucket(thisqid, 'unused')
    }
  }

  newblockkey = Object.keys(qbankinfo.progress.blockhist).length.toString()
  timelimit = -1
  if(store.get('timed-setting')) {
    timelimit = parseInt(store.get('timeperq-setting')) * blockqlist.length
  }
  qbankinfo.progress.blockhist[newblockkey] = {
    'blockqlist': blockqlist,
    'answers': Array(blockqlist.length).fill(''),
    'highlights': Array(blockqlist.length).fill('[]'),
    'complete': false,
    'timelimit': timelimit,
    'elapsedtime': 0,
    'numcorrect': 0,
    'qpoolstr': qpoolSettingEquiv[store.get('qpool-setting')],
    'tagschosenstr': store.get('recent-tagschosenstr'),
    'allsubtagsenabled': store.get('recent-allsubtagsenabled'),
    'starttime': (new Date()).toLocaleString(),
    'currentquesnum': 0,
    'showans': store.get('showans-setting')
  }
  qbankinfo.blockToOpen = newblockkey
  win.loadFile('examview.html')
  gaEvent('startblock')

  ipcMain.on("save-progress", (e, progress) => {
    console.log('--- save-progress event received ---');
    console.log('Saving progress:', {
      total: progress.stats.total,
      correct: progress.stats.correct,
      incorrect: progress.stats.incorrect
    });
    
    // Update in-memory data
    qbankinfo.progress = progress;
    
    // Save to user's data directory
    const userData = loadUserData();
    userData.progress = {
      ...progress,
      lastUpdated: new Date().toISOString()
    };
    
    console.log('Saving progress for user:', userData.userId);
    const saveResult = saveUserData(userData);
    console.log('Save result:', saveResult ? 'Success' : 'Failed');
  })
})

ipcMain.on("pauseblock", (e, progress)=>{
  console.log('--- pauseblock event received ---');
  qbankinfo.progress = progress;
  
  // Save to user's data directory
  const userData = loadUserData();
  userData.progress = qbankinfo.progress;
  saveUserData(userData);
  
  // Also save to the legacy location for backward compatibility
  fs.writeFile(currentpath + '/progress.json', JSON.stringify(qbankinfo.progress), (err) => {
    if(err) {
      console.error('Error saving progress to legacy location:', err);
    } else {
      if(doiquit) {
        appquit()
      }
    }
  })

  if(win) {
    win.loadFile('previousblocks.html')
    function clearblocktoopen() {
      if(win) {
        qbankinfo.blockToOpen = ''
      }
    }
    setTimeout(clearblocktoopen, 500)
  }

  ipcMain.on("save-highlight", (e, qid, highlight) => {
    console.log('--- save-highlight event received ---');
    console.log(`Saving highlight for question ${qid}:`, highlight);
    
    // Update in-memory data
    qbankinfo.highlights = qbankinfo.highlights || {};
    qbankinfo.highlights[qid] = highlight;
    
    // Save to user's data directory
    const userData = loadUserData();
    userData.highlights = userData.highlights || {};
    userData.highlights[qid] = highlight;
    
    console.log('Saving highlights for user:', userData.userId);
    const saveResult = saveUserData(userData);
    console.log('Save result:', saveResult ? 'Success' : 'Failed');
  })
})

ipcMain.on("openblock", (e, thiskey)=>{
  qbankinfo.blockToOpen = thiskey
  win.loadFile('examview.html')
  gaEvent('openblock')
})

ipcMain.on("deleteblock", (e, thiskey)=>{
  thisqlist = qbankinfo.progress.blockhist[thiskey].blockqlist
  for(var i=0; i<thisqlist.length; i++) {
    thisqid = thisqlist[i]
    if( isInBucket(thisqid, 'incorrects') ) {
      removeFromBucket(thisqid, 'incorrects')
    }
    if( isInBucket(thisqid, 'flagged') ) {
      removeFromBucket(thisqid, 'flagged')
    }
    addToBucket(thisqid, 'unused')
  }
  delete qbankinfo.progress.blockhist[thiskey]
  fs.writeFile(currentpath + '/progress.json', JSON.stringify(qbankinfo.progress), (err) => {
       if(err)
          console.log(err)
  })
})

ipcMain.on("resetqbank", (e) => {
  useprog = dialog.showMessageBoxSync(win, {message: 'Are you sure you want to delete all progress and reset this qbank?', type: 'question', buttons: ['Cancel', 'Reset'], defaultId: 0})
  if(useprog == 1) {
    fs.unlinkSync(currentpath + '/progress.json')
    loadqbank()
  }
})
