// TODO: convert to functional component

import PropTypes from 'prop-types';
import React from 'react';
import CodeMirror from 'codemirror';
import Fuse from 'fuse.js';
import emmet from '@emmetio/codemirror-plugin';
import prettier from 'prettier/standalone';
import babelParser from 'prettier/parser-babel';
import htmlParser from 'prettier/parser-html';
import cssParser from 'prettier/parser-postcss';
import { withTranslation } from 'react-i18next';
import StackTrace from 'stacktrace-js';
import 'codemirror/mode/css/css';
import 'codemirror/mode/clike/clike';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/lint/lint';
import 'codemirror/addon/lint/javascript-lint';
import 'codemirror/addon/lint/css-lint';
import 'codemirror/addon/lint/html-lint';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/indent-fold';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/comment/comment';
import 'codemirror/keymap/sublime';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/search/matchesonscrollbar';
import 'codemirror/addon/search/match-highlighter';
import 'codemirror/addon/search/jump-to-line';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/selection/mark-selection';
import 'codemirror/addon/hint/css-hint';
import 'codemirror-colorpicker';

import { JSHINT } from 'jshint';
import { CSSLint } from 'csslint';
import { HTMLHint } from 'htmlhint';
import classNames from 'classnames';
import { debounce } from 'lodash';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import MediaQuery from 'react-responsive';
import '../../../../utils/htmlmixed';
import '../../../../utils/p5-javascript';
import { metaKey } from '../../../../utils/metaKey';
import '../show-hint';
import * as hinter from '../../../../utils/p5-hinter';
import '../../../../utils/codemirror-search';
import { P5_CLASS_ITEMS } from './data';

import beepUrl from '../../../../sounds/audioAlert.mp3';
import RightArrowIcon from '../../../../images/right-arrow.svg';
import LeftArrowIcon from '../../../../images/left-arrow.svg';
import { getHTMLFile } from '../../reducers/files';
import { selectActiveFile } from '../../selectors/files';

import * as FileActions from '../../actions/files';
import * as IDEActions from '../../actions/ide';
import * as ProjectActions from '../../actions/project';
import * as EditorAccessibilityActions from '../../actions/editorAccessibility';
import * as PreferencesActions from '../../actions/preferences';
import * as UserActions from '../../../User/actions';
import * as ConsoleActions from '../../actions/console';

import AssetPreview from '../AssetPreview';
import Timer from '../Timer';
import EditorAccessibility from '../EditorAccessibility';
import UnsavedChangesIndicator from '../UnsavedChangesIndicator';
import { EditorContainer, EditorHolder } from './MobileEditor';
import { FolderIcon } from '../../../../common/icons';
import IconButton from '../../../../common/IconButton';

emmet(CodeMirror);

window.JSHINT = JSHINT;
window.CSSLint = CSSLint;
window.HTMLHint = HTMLHint;

const INDENTATION_AMOUNT = 2;

class Editor extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      currentLine: 1
    };
    this._cm = null;
    this.frameContainer = null;
    this.docContainer = null;
    this.contextMenuContainer = null;
    this.tidyCode = this.tidyCode.bind(this);

    this.updateLintingMessageAccessibility = debounce((annotations) => {
      this.props.clearLintMessage();
      annotations.forEach((x) => {
        if (x.from.line > -1) {
          this.props.updateLintMessage(x.severity, x.from.line + 1, x.message);
        }
      });
      if (this.props.lintMessages.length > 0 && this.props.lintWarning) {
        this.beep.play();
      }
    }, 2000);
    this.showFind = this.showFind.bind(this);
    this.showReplace = this.showReplace.bind(this);
    this.getContent = this.getContent.bind(this);
    this.showColorPicker = this.showColorPicker.bind(this);
    this.renderReferenceFrame = this.renderReferenceFrame.bind(this);
    this.renderDoc = this.renderDoc.bind(this);
  }

  componentDidMount() {
    this.beep = new Audio(beepUrl);
    // this.widgets = [];
    this._cm = CodeMirror(this.codemirrorContainer, {
      theme: `p5-${this.props.theme}`,
      lineNumbers: this.props.lineNumbers,
      styleActiveLine: true,
      inputStyle: 'contenteditable',
      lineWrapping: this.props.linewrap,
      fixedGutter: false,
      foldGutter: true,
      foldOptions: { widget: '\u2026' },
      gutters: ['CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
      keyMap: 'sublime',
      highlightSelectionMatches: true, // highlight current search match
      matchBrackets: true,
      emmet: {
        preview: ['html'],
        markTagPairs: true,
        autoRenameTags: true
      },
      autoCloseBrackets: this.props.autocloseBracketsQuotes,
      styleSelectedText: true,
      lint: {
        onUpdateLinting: (annotations) => {
          this.updateLintingMessageAccessibility(annotations);
        },
        options: {
          asi: true,
          eqeqeq: false,
          '-W041': false,
          esversion: 11
        }
      },
      colorpicker: {
        type: 'sketch',
        mode: 'edit'
      }
    });

    this.hinter = new Fuse(hinter.p5Hinter, {
      threshold: 0.05,
      keys: ['text']
    });

    delete this._cm.options.lint.options.errors;

    const replaceCommand =
      metaKey === 'Ctrl' ? `${metaKey}-H` : `${metaKey}-Option-F`;
    this._cm.setOption('extraKeys', {
      Tab: (cm) => {
        if (!cm.execCommand('emmetExpandAbbreviation')) return;
        // might need to specify and indent more?
        const selection = cm.doc.getSelection();
        if (selection.length > 0) {
          cm.execCommand('indentMore');
        } else {
          cm.replaceSelection(' '.repeat(INDENTATION_AMOUNT));
        }
      },
      Enter: 'emmetInsertLineBreak',
      Esc: 'emmetResetAbbreviation',
      [`Shift-Tab`]: false,
      [`${metaKey}-Enter`]: () => null,
      [`Shift-${metaKey}-Enter`]: () => null,
      [`${metaKey}-F`]: 'findPersistent',
      [`Shift-${metaKey}-F`]: this.tidyCode,
      [`${metaKey}-G`]: 'findPersistentNext',
      [`Shift-${metaKey}-G`]: 'findPersistentPrev',
      [replaceCommand]: 'replace',
      // Cassie Tarakajian: If you don't set a default color, then when you
      // choose a color, it deletes characters inline. This is a
      // hack to prevent that.
      [`${metaKey}-K`]: (cm, e) => this.showColorPicker(cm),
      [`${metaKey}-.`]: 'toggleComment', // Note: most adblockers use the shortcut ctrl+.
      [`${metaKey}-]`]: (cm, e) => {
        const cursor = cm.getCursor();
        const token = cm.getTokenAt(cursor);

        if (token) {
          const hints = this.hinter
            .search(token.string)
            .filter((h) => h.item.text === token.string);

          if (hints && hints.length === 1) {
            const { p5, text } = hints[0].item;
            if (p5) {
              const url = `https://p5js.org/reference/p5/${text}`;
              this.renderReferenceFrame(url);
            }
          }
        }
      },
      [`${metaKey}-0`]: (cm) => {
        const doc = cm.getDoc();
        const cursor = doc.getCursor();
        const { line } = cursor;
        const lineContent = doc.getLine(line);

        if (line === 0) return;

        const targetLine = line - 1;
        const targetContent = doc.getLine(targetLine);

        doc.replaceRange(
          `${targetContent}\n`,
          { line, ch: 0 },
          { line: line + 1, ch: 0 }
        );
        doc.replaceRange(
          `${lineContent}\n`,
          { line: targetLine, ch: 0 },
          { line: targetLine + 1, ch: 0 }
        );

        doc.setCursor({ line: targetLine, ch: cursor.ch });
      },
      [`${metaKey}-9`]: (cm) => {
        const doc = cm.getDoc();
        const cursor = doc.getCursor();
        const { line } = cursor;
        const lineContent = doc.getLine(line);

        if (line === doc.lineCount() - 1) return;

        const targetLine = line + 1;
        const targetContent = doc.getLine(targetLine);

        doc.replaceRange(
          `${targetContent}\n`,
          { line, ch: 0 },
          { line: line + 1, ch: 0 }
        );
        doc.replaceRange(
          `${lineContent}\n`,
          { line: targetLine, ch: 0 },
          { line: targetLine + 1, ch: 0 }
        );

        doc.setCursor({ line: targetLine, ch: cursor.ch });
      }
    });

    this.initializeDocuments(this.props.files);
    this._cm.swapDoc(this._docs[this.props.file.id]);

    this._cm.on(
      'change',
      debounce(() => {
        this.props.setUnsavedChanges(true);
        this.props.hideRuntimeErrorWarning();
        this.props.updateFileContent(this.props.file.id, this._cm.getValue());
        if (this.props.autorefresh && this.props.isPlaying) {
          this.props.clearConsole();
          this.props.startSketch();
        }
      }, 1000)
    );

    if (this._cm) {
      this._cm.on('keyup', this.handleKeyUp);
    }

    this._cm.on('keydown', (_cm, e) => {
      // Show hint
      const mode = this._cm.getOption('mode');
      if (/^[a-z]$/i.test(e.key) && (mode === 'css' || mode === 'javascript')) {
        this.showHint(_cm);
      }
    });

    const debouncedMouseMove = debounce((event) => {
      const cm = this._cm;

      const pos = cm.coordsChar({ left: event.clientX, top: event.clientY });
      const token = cm.getTokenAt(pos);

      if (token && token.string) {
        const doc = P5_CLASS_ITEMS.find((item) => item.name === token.string);

        if (doc) {
          const coords = cm.charCoords(pos, 'page');
          this.renderDoc(doc, coords);
        }
      }
    }, 200);

    this._cm
      .getWrapperElement()
      .addEventListener('mousemove', debouncedMouseMove);

    this._cm.getWrapperElement().addEventListener('mouseleave', () => {
      if (this.docContainer) {
        document.body.removeChild(this.docContainer);
        this.docContainer = null;
      }
    });

    this._cm.on('contextmenu', (cm, event) => {
      event.preventDefault();

      const menuItems = [
        {
          name: 'Format',
          shortcut: 'Ctrl+Shift+F',
          action: () => {
            this.tidyCode();
          }
        },
        {
          name: 'Find',
          shortcut: 'Ctrl+f',
          action: () => {
            this.showFind();
          }
        },
        {
          name: 'Replace',
          shortcut: 'Ctrl+h',
          action: () => {
            this.showReplace();
          }
        },
        {
          name: 'Color Picker',
          shortcut: 'Ctrl+k',
          action: () => {
            this.showColorPicker(cm);
          }
        },
        {
          name: 'Cut',
          shortcut: 'Ctrl+x',
          action: async () => {
            const selectedText = cm.getSelection();
            if (!selectedText) return;

            try {
              await navigator.clipboard.writeText(selectedText);
              cm.replaceSelection('');
            } catch (err) {
              console.error('Failed to cut text:', err);
            }
          }
        },
        {
          name: 'Copy',
          shortcut: 'Ctrl+c',
          action: async () => {
            const selectedText = cm.getSelection();
            if (!selectedText) return;

            try {
              await navigator.clipboard.writeText(selectedText);
            } catch (err) {
              console.error('Failed to copy text:', err);
            }
          }
        },
        {
          name: 'Paste',
          shortcut: 'Ctrl+p',
          action: async () => {
            try {
              const clipboardText = await navigator.clipboard.readText();
              if (clipboardText) {
                cm.replaceSelection(clipboardText);
              }
            } catch (err) {
              console.error('Failed to paste text:', err);
            }
          }
        },
        {
          name: 'Undo',
          shortcut: 'Ctrl+z',
          action: () => {
            this._cm.undo();
          }
        },
        {
          name: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          action: () => {
            this._cm.redo();
          }
        }
      ];

      this.renderContextMenu(menuItems, {
        left: event.clientX,
        top: event.clientY
      });
    });

    this._cm.getWrapperElement().style[
      'font-size'
    ] = `${this.props.fontSize}px`;

    this.props.provideController({
      tidyCode: this.tidyCode,
      showFind: this.showFind,
      showReplace: this.showReplace,
      getContent: this.getContent
    });
  }

  componentWillUpdate(nextProps) {
    // check if files have changed
    if (this.props.files[0].id !== nextProps.files[0].id) {
      // then need to make CodeMirror documents
      this.initializeDocuments(nextProps.files);
    }
    if (this.props.files.length !== nextProps.files.length) {
      this.initializeDocuments(nextProps.files);
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.file.id !== prevProps.file.id) {
      const fileMode = this.getFileMode(this.props.file.name);
      if (fileMode === 'javascript') {
        // Define the new Emmet configuration based on the file mode
        const emmetConfig = {
          preview: ['html'],
          markTagPairs: false,
          autoRenameTags: true
        };
        this._cm.setOption('emmet', emmetConfig);
      }
      const oldDoc = this._cm.swapDoc(this._docs[this.props.file.id]);
      this._docs[prevProps.file.id] = oldDoc;
      this._cm.focus();

      if (!prevProps.unsavedChanges) {
        setTimeout(() => this.props.setUnsavedChanges(false), 400);
      }
    }
    if (this.props.fontSize !== prevProps.fontSize) {
      this._cm.getWrapperElement().style[
        'font-size'
      ] = `${this.props.fontSize}px`;
    }
    if (this.props.linewrap !== prevProps.linewrap) {
      this._cm.setOption('lineWrapping', this.props.linewrap);
    }
    if (this.props.theme !== prevProps.theme) {
      this._cm.setOption('theme', `p5-${this.props.theme}`);
    }
    if (this.props.lineNumbers !== prevProps.lineNumbers) {
      this._cm.setOption('lineNumbers', this.props.lineNumbers);
    }
    if (
      this.props.autocloseBracketsQuotes !== prevProps.autocloseBracketsQuotes
    ) {
      this._cm.setOption(
        'autoCloseBrackets',
        this.props.autocloseBracketsQuotes
      );
    }
    if (this.props.autocompleteHinter !== prevProps.autocompleteHinter) {
      if (!this.props.autocompleteHinter) {
        // close the hinter window once the preference is turned off
        CodeMirror.showHint(this._cm, () => {}, {});
      }
    }

    if (this.props.runtimeErrorWarningVisible) {
      if (this.props.consoleEvents.length !== prevProps.consoleEvents.length) {
        this.props.consoleEvents.forEach((consoleEvent) => {
          if (consoleEvent.method === 'error') {
            // It doesn't work if you create a new Error, but this works
            // LOL
            const errorObj = { stack: consoleEvent.data[0].toString() };
            StackTrace.fromError(errorObj).then((stackLines) => {
              this.props.expandConsole();
              const line = stackLines.find(
                (l) => l.fileName && l.fileName.startsWith('/')
              );
              if (!line) return;
              const fileNameArray = line.fileName.split('/');
              const fileName = fileNameArray.slice(-1)[0];
              const filePath = fileNameArray.slice(0, -1).join('/');
              const fileWithError = this.props.files.find(
                (f) => f.name === fileName && f.filePath === filePath
              );
              this.props.setSelectedFile(fileWithError.id);
              this._cm.addLineClass(
                line.lineNumber - 1,
                'background',
                'line-runtime-error'
              );
            });
          }
        });
      } else {
        for (let i = 0; i < this._cm.lineCount(); i += 1) {
          this._cm.removeLineClass(i, 'background', 'line-runtime-error');
        }
      }
    }

    if (this.props.file.id !== prevProps.file.id) {
      for (let i = 0; i < this._cm.lineCount(); i += 1) {
        this._cm.removeLineClass(i, 'background', 'line-runtime-error');
      }
    }

    this.props.provideController({
      tidyCode: this.tidyCode,
      showFind: this.showFind,
      showReplace: this.showReplace,
      getContent: this.getContent
    });
  }

  componentWillUnmount() {
    if (this._cm) {
      this._cm.off('keyup', this.handleKeyUp);
    }
    this.props.provideController(null);
  }

  getFileMode(fileName) {
    let mode;
    if (fileName.match(/.+\.js$/i)) {
      mode = 'javascript';
    } else if (fileName.match(/.+\.css$/i)) {
      mode = 'css';
    } else if (fileName.match(/.+\.(html|xml)$/i)) {
      mode = 'htmlmixed';
    } else if (fileName.match(/.+\.json$/i)) {
      mode = 'application/json';
    } else if (fileName.match(/.+\.(frag|glsl)$/i)) {
      mode = 'x-shader/x-fragment';
    } else if (fileName.match(/.+\.(vert|stl|mtl)$/i)) {
      mode = 'x-shader/x-vertex';
    } else {
      mode = 'text/plain';
    }
    return mode;
  }

  getContent() {
    const content = this._cm.getValue();
    const updatedFile = Object.assign({}, this.props.file, { content });
    return updatedFile;
  }

  handleKeyUp = () => {
    const lineNumber = parseInt(this._cm.getCursor().line + 1, 10);
    this.setState({ currentLine: lineNumber });
  };

  showFind() {
    this._cm.execCommand('findPersistent');
  }

  showHint(_cm) {
    if (!this.props.autocompleteHinter) {
      CodeMirror.showHint(_cm, () => {}, {});
      return;
    }

    let focusedLinkElement = null;
    const setFocusedLinkElement = (set) => {
      if (set && !focusedLinkElement) {
        const activeItemLink = document.querySelector(
          `.CodeMirror-hint-active a`
        );
        if (activeItemLink) {
          focusedLinkElement = activeItemLink;
          focusedLinkElement.classList.add('focused-hint-link');
          focusedLinkElement.parentElement.parentElement.classList.add(
            'unfocused'
          );
        }
      }
    };
    const removeFocusedLinkElement = () => {
      if (focusedLinkElement) {
        focusedLinkElement.classList.remove('focused-hint-link');
        focusedLinkElement.parentElement.parentElement.classList.remove(
          'unfocused'
        );
        focusedLinkElement = null;
        return true;
      }
      return false;
    };

    const hintOptions = {
      _fontSize: this.props.fontSize,
      completeSingle: false,
      extraKeys: {
        'Shift-Right': (cm, e) => {
          const activeItemLink = document.querySelector(
            `.CodeMirror-hint-active a`
          );
          if (activeItemLink) activeItemLink.click();
        },
        Right: (cm, e) => {
          setFocusedLinkElement(true);
        },
        Left: (cm, e) => {
          removeFocusedLinkElement();
        },
        Up: (cm, e) => {
          const onLink = removeFocusedLinkElement();
          e.moveFocus(-1);
          setFocusedLinkElement(onLink);
        },
        Down: (cm, e) => {
          const onLink = removeFocusedLinkElement();
          e.moveFocus(1);
          setFocusedLinkElement(onLink);
        },
        Enter: (cm, e) => {
          if (focusedLinkElement) focusedLinkElement.click();
          else e.pick();
        }
      },
      closeOnUnfocus: false
    };

    if (_cm.options.mode === 'javascript') {
      // JavaScript
      CodeMirror.showHint(
        _cm,
        () => {
          const text = _cm.getValue();

          const words = [...new Set(text.match(/\b\w+\b/g) || [])];

          const c = _cm.getCursor();
          const token = _cm.getTokenAt(c);

          const hints = this.hinter
            .search(token.string)
            .filter((h) => h.item.text[0] === token.string[0]);

          const hintWords = new Set(hints.map((h) => h.item.text));

          const editorSuggestions = words
            .filter((word) => word.startsWith(token.string))
            .filter((word) => !hintWords.has(word))
            .map((word, index) => ({
              item: {
                text: word,
                type: 'abc',
                params: [],
                p5: false
              },
              refIndex: index
            }));

          const combinedSuggestions = [...hints, ...editorSuggestions];

          return {
            list: combinedSuggestions,
            from: CodeMirror.Pos(c.line, token.start),
            to: CodeMirror.Pos(c.line, c.ch)
          };
        },
        hintOptions
      );
    } else if (_cm.options.mode === 'css') {
      // CSS
      CodeMirror.showHint(_cm, CodeMirror.hint.css, hintOptions);
    }
  }

  showReplace() {
    this._cm.execCommand('replace');
  }

  prettierFormatWithCursor(parser, plugins) {
    try {
      const { formatted, cursorOffset } = prettier.formatWithCursor(
        this._cm.doc.getValue(),
        {
          cursorOffset: this._cm.doc.indexFromPos(this._cm.doc.getCursor()),
          parser,
          plugins
        }
      );
      const { left, top } = this._cm.getScrollInfo();
      this._cm.doc.setValue(formatted);
      this._cm.focus();
      this._cm.doc.setCursor(this._cm.doc.posFromIndex(cursorOffset));
      this._cm.scrollTo(left, top);
    } catch (error) {
      console.error(error);
    }
  }

  showColorPicker(cm) {
    return cm.state.colorpicker.popup_color_picker({ length: 0 });
  }

  tidyCode() {
    const mode = this._cm.getOption('mode');
    if (mode === 'javascript') {
      this.prettierFormatWithCursor('babel', [babelParser]);
    } else if (mode === 'css') {
      this.prettierFormatWithCursor('css', [cssParser]);
    } else if (mode === 'htmlmixed') {
      this.prettierFormatWithCursor('html', [htmlParser]);
    }
  }

  initializeDocuments(files) {
    this._docs = {};
    files.forEach((file) => {
      if (file.name !== 'root') {
        this._docs[file.id] = CodeMirror.Doc(
          file.content,
          this.getFileMode(file.name)
        ); // eslint-disable-line
      }
    });
  }

  renderContextMenu(items, coords) {
    if (this.contextMenuContainer !== null) {
      document.body.removeChild(this.contextMenuContainer);
      this.contextMenuContainer = null;
    }

    this.contextMenuContainer = document.createElement('div');
    this.contextMenuContainer.style.position = 'absolute';
    this.contextMenuContainer.style.zIndex = '1000';
    this.contextMenuContainer.style.background = '#fff';
    this.contextMenuContainer.style.border = '1px solid #ddd';
    this.contextMenuContainer.style.width = '220px';
    this.contextMenuContainer.style.overflow = 'hidden';
    this.contextMenuContainer.style.padding = '4px 0';
    this.contextMenuContainer.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    this.contextMenuContainer.style.borderRadius = '6px';

    let { left, top } = coords;

    const docWidth = document.documentElement.clientWidth;
    const docHeight = document.documentElement.clientHeight;
    const menuWidth = 220;
    const menuHeight = items.length * 40;

    if (left + menuWidth > docWidth) left = docWidth - menuWidth - 10;
    if (top + menuHeight > docHeight) top = docHeight - menuHeight - 10;

    this.contextMenuContainer.style.left = `${left}px`;
    this.contextMenuContainer.style.top = `${top}px`;

    items.forEach((item) => {
      const menuItem = document.createElement('div');
      menuItem.style.display = 'flex';
      menuItem.style.justifyContent = 'space-between';
      menuItem.style.alignItems = 'center';
      menuItem.style.padding = '8px 12px';
      menuItem.style.cursor = 'pointer';
      menuItem.style.fontSize = '14px';
      menuItem.style.fontFamily = 'Arial, sans-serif';
      menuItem.style.borderRadius = '4px';
      menuItem.style.transition = 'background 0.2s';

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#f5f5f5';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.action) {
          item.action();
        }
        if (this.contextMenuContainer !== null) {
          document.body.removeChild(this.contextMenuContainer);
          this.contextMenuContainer = null;
        }
      });

      const name = document.createElement('span');
      name.textContent = item.name;
      name.style.flex = '1';

      const shortcut = document.createElement('span');
      shortcut.textContent = item.shortcut;
      shortcut.style.color = '#888';
      shortcut.style.fontSize = '12px';

      menuItem.appendChild(name);
      menuItem.appendChild(shortcut);

      this.contextMenuContainer.appendChild(menuItem);
    });

    document.body.appendChild(this.contextMenuContainer);

    const closeMenu = (e) => {
      if (
        this.contextMenuContainer !== null &&
        !this.contextMenuContainer.contains(e.target)
      ) {
        document.body.removeChild(this.contextMenuContainer);
        this.contextMenuContainer = null;
        document.removeEventListener('click', closeMenu);
      }
    };
    document.addEventListener('click', closeMenu);
  }

  renderDoc(data, coords) {
    if (this.docContainer !== null) {
      document.body.removeChild(this.docContainer);
      this.docContainer = null;
    }

    this.docContainer = document.createElement('div');
    this.docContainer.style.position = 'fixed';
    this.docContainer.style.zIndex = 25;
    this.docContainer.style.background = '#fff';
    this.docContainer.style.border = '1px solid #dddddd';
    this.docContainer.style.width = '400px';
    this.docContainer.style.maxHeight = '300px';
    this.docContainer.style.overflow = 'auto';
    this.docContainer.style.padding = '5px';

    let left = coords.left + 10;
    let top = coords.top + 20;

    const docWidth = document.documentElement.clientWidth;
    const docHeight = document.documentElement.clientHeight;
    const tooltipWidth = 300;
    const tooltipHeight = 100;

    if (left + tooltipWidth > docWidth) left = docWidth - tooltipWidth - 10;
    if (top + tooltipHeight > docHeight) top = docHeight - tooltipHeight - 10;

    this.docContainer.style.left = `${left}px`;
    this.docContainer.style.top = `${top}px`;

    const heading = document.createElement('h1');
    heading.innerHTML = `<span>(${data.itemtype})</span> ${data.name}`;
    heading.style.display = 'flex';
    heading.style.flexDirection = 'row';
    heading.style.alignItems = 'center';
    heading.style.gap = '5px';

    const description = document.createElement('p');
    description.innerHTML = data.description;

    this.docContainer.appendChild(heading);
    this.docContainer.appendChild(description);
    document.body.appendChild(this.docContainer);
  }

  renderReferenceFrame(url) {
    if (this.frameContainer !== null) {
      document.body.removeChild(this.frameContainer);
      this.frameContainer = null;
    }

    this.frameContainer = document.createElement('div');
    this.frameContainer.style.position = 'fixed';
    this.frameContainer.style.zIndex = 20;
    this.frameContainer.style.top = 0;
    this.frameContainer.style.right = 0;
    this.frameContainer.style.bottom = 0;
    this.frameContainer.style.border = '1px solid #ccc';
    this.frameContainer.style.background = '#fff';

    const closeButton = document.createElement('button');
    closeButton.innerText = 'close';
    closeButton.style.width = '100%';
    closeButton.style.color = 'white';
    closeButton.style.background = '#000';
    closeButton.style.padding = '3px 6px';
    closeButton.addEventListener('click', () => {
      if (this.frameContainer !== null) {
        document.body.removeChild(this.frameContainer);
        this.frameContainer = null;
      }
    });

    const docFrame = document.createElement('iframe');
    docFrame.style.background = '#fff';
    docFrame.style.border = '1px solid #fff';
    docFrame.style.width = '400px';
    docFrame.style.height = '100%';
    docFrame.style.display = 'block';

    docFrame.src = url;

    this.frameContainer.appendChild(closeButton);
    this.frameContainer.appendChild(docFrame);
    document.body.appendChild(this.frameContainer);
  }

  render() {
    const editorSectionClass = classNames({
      editor: true,
      'sidebar--contracted': !this.props.isExpanded
    });

    const editorHolderClass = classNames({
      'editor-holder': true,
      'editor-holder--hidden':
        this.props.file.fileType === 'folder' || this.props.file.url
    });

    const { currentLine } = this.state;

    return (
      <MediaQuery minWidth={770}>
        {(matches) =>
          matches ? (
            <section className={editorSectionClass}>
              <div className="editor__header">
                <button
                  aria-label={this.props.t('Editor.OpenSketchARIA')}
                  className="sidebar__contract"
                  onClick={() => {
                    this.props.collapseSidebar();
                    this.props.closeProjectOptions();
                  }}
                >
                  <LeftArrowIcon focusable="false" aria-hidden="true" />
                </button>
                <button
                  aria-label={this.props.t('Editor.CloseSketchARIA')}
                  className="sidebar__expand"
                  onClick={this.props.expandSidebar}
                >
                  <RightArrowIcon focusable="false" aria-hidden="true" />
                </button>
                <div className="editor__file-name">
                  <span>
                    {this.props.file.name}
                    <UnsavedChangesIndicator />
                  </span>
                  <Timer />
                </div>
              </div>
              <article
                ref={(element) => {
                  this.codemirrorContainer = element;
                }}
                className={editorHolderClass}
              />
              {this.props.file.url ? (
                <AssetPreview
                  url={this.props.file.url}
                  name={this.props.file.name}
                />
              ) : null}
              <EditorAccessibility
                lintMessages={this.props.lintMessages}
                currentLine={currentLine}
              />
            </section>
          ) : (
            <EditorContainer expanded={this.props.isExpanded}>
              <div>
                <IconButton
                  onClick={this.props.expandSidebar}
                  icon={FolderIcon}
                />
                <span>
                  {this.props.file.name}
                  <UnsavedChangesIndicator />
                </span>
              </div>
              <section>
                <EditorHolder
                  ref={(element) => {
                    this.codemirrorContainer = element;
                  }}
                />
                {this.props.file.url ? (
                  <AssetPreview
                    url={this.props.file.url}
                    name={this.props.file.name}
                  />
                ) : null}
                <EditorAccessibility
                  lintMessages={this.props.lintMessages}
                  currentLine={currentLine}
                />
              </section>
            </EditorContainer>
          )
        }
      </MediaQuery>
    );
  }
}

Editor.propTypes = {
  autocloseBracketsQuotes: PropTypes.bool.isRequired,
  autocompleteHinter: PropTypes.bool.isRequired,
  lineNumbers: PropTypes.bool.isRequired,
  lintWarning: PropTypes.bool.isRequired,
  linewrap: PropTypes.bool.isRequired,
  lintMessages: PropTypes.arrayOf(
    PropTypes.shape({
      severity: PropTypes.oneOf(['error', 'hint', 'info', 'warning'])
        .isRequired,
      line: PropTypes.number.isRequired,
      message: PropTypes.string.isRequired,
      id: PropTypes.number.isRequired
    })
  ).isRequired,
  consoleEvents: PropTypes.arrayOf(
    PropTypes.shape({
      method: PropTypes.string.isRequired,
      args: PropTypes.arrayOf(PropTypes.string)
    })
  ).isRequired,
  updateLintMessage: PropTypes.func.isRequired,
  clearLintMessage: PropTypes.func.isRequired,
  updateFileContent: PropTypes.func.isRequired,
  fontSize: PropTypes.number.isRequired,
  file: PropTypes.shape({
    name: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    fileType: PropTypes.string.isRequired,
    url: PropTypes.string
  }).isRequired,
  setUnsavedChanges: PropTypes.func.isRequired,
  startSketch: PropTypes.func.isRequired,
  autorefresh: PropTypes.bool.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  theme: PropTypes.string.isRequired,
  unsavedChanges: PropTypes.bool.isRequired,
  files: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      content: PropTypes.string.isRequired
    })
  ).isRequired,
  isExpanded: PropTypes.bool.isRequired,
  collapseSidebar: PropTypes.func.isRequired,
  closeProjectOptions: PropTypes.func.isRequired,
  expandSidebar: PropTypes.func.isRequired,
  clearConsole: PropTypes.func.isRequired,
  hideRuntimeErrorWarning: PropTypes.func.isRequired,
  runtimeErrorWarningVisible: PropTypes.bool.isRequired,
  provideController: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  setSelectedFile: PropTypes.func.isRequired,
  expandConsole: PropTypes.func.isRequired
};

function mapStateToProps(state) {
  return {
    files: state.files,
    file: selectActiveFile(state),
    htmlFile: getHTMLFile(state.files),
    ide: state.ide,
    preferences: state.preferences,
    editorAccessibility: state.editorAccessibility,
    user: state.user,
    project: state.project,
    consoleEvents: state.console,

    ...state.preferences,
    ...state.ide,
    ...state.project,
    ...state.editorAccessibility,
    isExpanded: state.ide.sidebarIsExpanded
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    Object.assign(
      {},
      EditorAccessibilityActions,
      FileActions,
      ProjectActions,
      IDEActions,
      PreferencesActions,
      UserActions,
      ConsoleActions
    ),
    dispatch
  );
}

export default withTranslation()(
  connect(mapStateToProps, mapDispatchToProps)(Editor)
);
