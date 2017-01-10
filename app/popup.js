'use strict';

require([
  'jquery',
  'jquery-timeago',
  'react',
  'react-dom',
  'underscore',
  'util'
], function($, timeago, React, ReactDOM, _, util) {

  const TW = chrome.extension.getBackgroundPage().TW;

  // Unpack TW.
  const {
    settings,
    tabmanager,
  } = TW;

  function secondsToMinutes(seconds) {
    var s = seconds % 60;
    s = s > 10 ? String(s) : "0" + String(s);
    return String(Math.floor(seconds / 60)) + ":" + s;
  }

  function truncateString(str, length) {
    if (str.length > (length + 3) ) {
      return str.substring(0, length) + "...";
    }
    return str;
  };

  class OpenTabRow extends React.Component {
    handleLockedOnChange = (event) => {
      const {tab} = this.props;
      if (event.target.checked) {
        this.props.onLockTab(tab.id);
      } else {
        this.props.onUnlockTab(tab.id)
      }
    };

    render() {
      const {tab} = this.props;
      const tabWhitelistMatch = tabmanager.getWhitelistMatch(tab.url);
      const tabIsLocked = tab.pinned || tabWhitelistMatch || this.props.isLocked;

      let lockStatusElement;
      if (tabIsLocked) {
        let reason = 'Locked';
        if (tab.pinned) {
          reason = 'Pinned';
        } else if (tabWhitelistMatch) {
          reason = <a href="#" title={tabWhitelistMatch}>Auto-Lock</a>
          // reason = $('<a href="#" title="' + tabWhitelistMatch + '">Auto-Lock</a>').click(function() {
          //   $('a[href="#tabOptions"]').tab('show');
          // });
        }

        lockStatusElement = <td className="muted">{reason}</td>;
      } else {
        let timeLeftContent;
        if (settings.get('paused')) {
          timeLeftContent = 'Paused';
        } else {
          const lastModified = tabmanager.tabTimes[tab.id];
          const cutOff = new Date().getTime() - settings.get('stayOpen');
          const timeLeft = -1 * (Math.round((cutOff - lastModified) / 1000)).toString();
          timeLeftContent = secondsToMinutes(timeLeft);
        }

        lockStatusElement = <td className="time-left">{timeLeftContent}</td>;
      }

      return (
        <tr>
          <td className="narrowColumn">
            <input
              checked={tabIsLocked}
              disabled={tab.pinned || tabWhitelistMatch}
              onChange={this.handleLockedOnChange}
              type="checkbox"
            />
          </td>
          <td className="narrowColumn">
            <img alt="" height="16" src={tab.favIconUrl} width="16" />
          </td>
          <td>
            <strong className="tabTitle">{truncateString(tab.title, 70)}</strong>
            <br />
            <span className="tabUrl">{truncateString(tab.url, 70)}</span>
          </td>
          {lockStatusElement}
        </tr>
      );
    }
  }

  class LockTab extends React.PureComponent {
    constructor() {
      super();
      this.state = {
        tabs: [],
      };
    }

    componentWillMount() {
      this._timeLeftInterval = window.setInterval(this.forceUpdate.bind(this), 1000);

      // TODO: THIS WILL BREAK. This is some async stuff inside a synchronous call. Fix this, move
      // the state into a higher component.
      chrome.tabs.query({}, tabs => { this.setState({tabs}); })
    }

    componentWillUnmount() {
      window.clearInterval(this._timeLeftInterval);
    }

    handleLockTab = (tabId) => {
      tabmanager.lockTab(tabId);
      this.forceUpdate();
    };

    handleUnlockTab = (tabId) => {
      tabmanager.unlockTab(tabId);
      this.forceUpdate();
    };

    render() {
      const lockedIds = settings.get('lockedIds');

      return (
        <div className="tab-pane active" id="tabActive">
          <div className="alert alert-info">Click the checkbox to lock the tab (prevent it from auto-closing).</div>
          <table id="activeTabs" className="table table-condensed table-striped table-bordered">
            <thead>
              <tr>
                <th className="narrowColumn">
                  <i className="icon icon-lock" title="Lock/Unlock"></i>
                </th>
                <th className="narrowColumn"></th>
                <th>Tab</th>
                <th className="countdownColumn">
                  <i className="icon icon-time" title="Closing in..."></i>
                </th>
              </tr>
            </thead>
            <tbody>
              {this.state.tabs.map(tab =>
                <OpenTabRow
                  isLocked={lockedIds.indexOf(tab.id) !== -1}
                  onLockTab={this.handleLockTab}
                  onUnlockTab={this.handleUnlockTab}
                  tab={tab}
                />
              )}
            </tbody>
          </table>
        </div>
      );
    }
  }

  var Popup = {};

  Popup.optionsTab = {};
  /**
   * Initialization for options tab.
   * @param context
   *  Optionally used to limit jQueries
   */
  Popup.optionsTab.init = function(context) {
    $('#saveOptionsBtn', context).click(Popup.optionsTab.saveOption);

    function onBlurInput() {
      var key = this.id;
      Popup.optionsTab.saveOption(key, $(this).val());
    }

    function onChangeCheckBox() {
      var key = this.id;
      if ($(this).attr('checked')) {
        Popup.optionsTab.saveOption(key, $(this).val());
      } else {
        Popup.optionsTab.saveOption(key, false);
      }
    }

    $('#minutesInactive').change(_.debounce(onBlurInput, 150));
    $('#minTabs').change(_.debounce(onBlurInput, 150));
    $('#maxTabs').change(_.debounce(onBlurInput, 150));
    $('#purgeClosedTabs').change(onChangeCheckBox);
    $('#showBadgeCount').change(onChangeCheckBox);
  };

  Popup.optionsTab.saveOption = function (key, value) {
    var errors = [];
    $('#status').html();

    try {
      settings.set(key, value);
    } catch (err) {
      errors.push(err);
    }

    $('#status').removeClass();
    $('#status').css('visibility', 'visible');
    $('#status').css('opacity', '100');

    if (errors.length === 0) {
      $('#status').html('Saving...');
      $('#status').addClass('alert-success').addClass('alert');
      $('#status').delay(50).animate({opacity:0});
    } else {
      var $errorList = $('<ul></ul>');
      for (var i=0; i< errors.length; i++) {
        $errorList.append('<li>' + errors[i].message + '</li>');
      }
      $('#status').append($errorList).addClass('alert-error').addClass('alert');
    }
    return false;
  };

  function isValidPattern(pattern) {
    // some other choices such as '/' also do not make sense
    // not sure if they should be blocked as well
    return pattern != null && pattern.length > 0 && /\S/.test(pattern);
  }

  class OptionsTab extends React.Component {
    constructor() {
      super();
      this.state = {
        newPattern: '',
      };
    }

    componentDidMount() {
      Popup.optionsTab.init($('div#tabOptions'));
    }

    handleClickRemovePattern(pattern) {
      const whitelist = settings.get('whitelist');
      whitelist.remove(whitelist.indexOf(pattern));
      Popup.optionsTab.saveOption('whitelist', whitelist);
      this.forceUpdate();
    }

    handleAddPatternClick = () => {
      const {newPattern} = this.state;

      if (!isValidPattern(newPattern)) {
        return;
      }

      const whitelist = settings.get('whitelist');

      // Only add the pattern again if it's new, not yet in the whitelist.
      if (whitelist.indexOf(newPattern) === -1) {
        whitelist.push(newPattern);
        Popup.optionsTab.saveOption('whitelist', whitelist);
      }

      this.setState({newPattern: ''});
    };

    handleNewPatternChange = (event) => {
      this.setState({newPattern: event.target.value});
    };

    render() {
      const whitelist = settings.get('whitelist');

      return (
        <div className="tab-pane active" id="tabOptions">
          <form>
            <fieldset>
              <legend>Settings</legend>
              <p>
                <label htmlFor="minutesInactive">Close inactive tabs after:</label>
                <input
                  className="span1"
                  defaultValue={settings.get('minutesInactive')}
                  id="minutesInactive"
                  min="1"
                  name="minutesInactive"
                  type="number"
                /> minutes.
              </p>
              <p>
                <label htmlFor="minTabs">Don't auto-close if I only have</label>
                <input
                  className="span1"
                  defaultValue={settings.get('minTabs')}
                  id="minTabs"
                  min="0"
                  name="minTabs"
                  type="number"
                /> tabs open (does not include pinned or locked tabs).
              </p>
              <p>
                <label htmlFor="maxTabs">Remember up to</label>
                <input
                  className="span1"
                  defaultValue={settings.get('maxTabs')}
                  id="maxTabs"
                  min="0"
                  name="maxTabs"
                  type="number"
                /> closed tabs.
              </p>
              <p>
                <label className="checkbox">Clear closed tabs list on quit
                  <input
                    className="span1"
                    defaultChecked={settings.get('purgeClosedTabs')}
                    id="purgeClosedTabs"
                    name="purgeClosedTabs"
                    type="checkbox"
                  />
                </label>
              </p>
              <p>
                <label className="checkbox">Show # of closed tabs in url bar
                  <input
                    className="span1"
                    defaultChecked={settings.get('showBadgeCount')}
                    id="showBadgeCount"
                    name="showBadgeCount"
                    type="checkbox"
                  />
                </label>
              </p>
            </fieldset>

            <div id="status" className="alert alert-success" style={{visibility: 'hidden'}}></div>

            <fieldset>
              <legend>Auto-Lock</legend>
              <label htmlFor="wl-add">tabs with urls "like":</label>
              <div className="input-append">
                <input
                  id="wl-add"
                  onChange={this.handleNewPatternChange}
                  type="text"
                  value={this.state.newPattern}
                />
                <button
                  className="btn"
                  disabled={!isValidPattern(this.state.newPattern)}
                  id="addToWL"
                  onClick={this.handleAddPatternClick}>
                  Add
                </button>
              </div>

              <table
                className="table table-bordered table-striped"
                id="whitelist"
                style={{marginTop: '20px'}}>
                <thead>
                  <th>URL Pattern</th>
                  <th></th>
                </thead>
                <tbody>
                  {whitelist.map(pattern =>
                    <tr>
                      <td>{pattern}</td>
                      <td>
                        <a
                          className="deleteLink"
                          href="#"
                          onClick={this.handleClickRemovePattern.bind(this, pattern)}>
                          Remove
                        </a>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <span className="help-block">
                Example: <i>cnn</i> would match every page on cnn.com and any URL with cnn anywhere in url.
              </span>
            </fieldset>
          </form>
        </div>
      );
    }
  }

  class ClosedTabGroupHeader extends React.PureComponent {
    handleClickRestoreAll = () => {
      this.props.onRestoreAll(this.props.title);
    };

    render() {
      return (
        <tr className="info">
          <td colSpan="3" className="timeGroupRow">
            <button
              className="btn btn-mini pull-right"
              onClick={this.handleClickRestoreAll}>
              Restore all
            </button>
            closed {this.props.title}
          </td>
        </tr>
      );
    }
  }

  class ClosedTabRow extends React.PureComponent {
    constructor() {
      super();

      this.state = {
        active: false,
      };
    }

    handleMouseEnter = () => {
      this.setState({active: true});
    };

    handleMouseLeave = () => {
      this.setState({active: false});
    };

    openTab = (event) => {
      const {tab} = this.props;
      event.preventDefault();
      this.props.onOpenTab(tab.id, tab.url);
    };

    removeTabFromList = (event) => {
      this.props.onRemoveTabFromList(this.props.tab.id);
    };

    render() {
      const {tab} = this.props;

      let favicon;
      if (this.state.active) {
        favicon = (
          <i
            className="btn-remove icon-remove"
            onClick={this.removeTabFromList}
            title="Remove tab from list"
          />
        );
      } else {
        favicon = (tab.favIconUrl == null)
          ? '-'
          : <img className="favicon" height="16" src={tab.favIconUrl} width="16" />;
      }

      return (
        <tr onMouseEnter={this.handleMouseEnter} onMouseLeave={this.handleMouseLeave}>
          <td className="faviconCol">
            {favicon}
          </td>
          <td>
            <a target="_blank" href={tab.url} onClick={this.openTab}>
              {truncateString(tab.title, 70)}
            </a>
          </td>
          <td>
            {$.timeago(tab.closedAt)}
          </td>
        </tr>
      );
    }
  }

  class CorralTab extends React.Component {
    constructor() {
      super();

      this.state = {
        closedTabGroups: [],
        filter: '',
      };
    }

    componentDidMount() {
      // TODO: This is assumed to be synchronous. If it becomes async, this state needs to be
      // hoisted so this component does not need to track whether it's mounted.
      tabmanager.searchTabs(this.setClosedTabs);
    }

    clearList = () => {
      this.state.closedTabGroups.forEach(closedTabGroup => {
        closedTabGroup.tabs.forEach(tab => {
          tabmanager.closedTabs.removeTab(tab.id);
        });
      });
      tabmanager.updateClosedCount();
      this.setState({
        closedTabGroups: [],
      });
    };

    handleRemoveTabFromList = (tabId) => {
      tabmanager.closedTabs.removeTab(tabId);
      tabmanager.searchTabs(this.setClosedTabs, [tabmanager.filters.keyword(this.state.filter)]);
      this.forceUpdate();
    };

    handleRestoreAllFromGroup = (groupTitle) => {
      const group = _.findWhere(this.state.closedTabGroups, {title: groupTitle});
      group.tabs.forEach(tab => {
        chrome.tabs.create({active: false, url: tab.url});
        tabmanager.closedTabs.removeTab(tab.id);
      });
      tabmanager.searchTabs(this.setClosedTabs, [tabmanager.filters.keyword(this.state.filter)]);
      this.forceUpdate();
    };

    openTab = (tabId, url) => {
      chrome.tabs.create({active: false, url});
      tabmanager.closedTabs.removeTab(tabId);
      tabmanager.searchTabs(this.setClosedTabs, [tabmanager.filters.keyword(this.state.filter)]);
      this.forceUpdate();
    };

    setClosedTabs = (closedTabs) => {
      const now = new Date().getTime();
      const separations = []
      separations.push([now - (1000 * 60 * 30), 'in the last 1/2 hour']);
      separations.push([now - (1000 * 60 * 60), 'in the last hour']);
      separations.push([now - (1000 * 60 * 60 * 2),'in the last 2 hours']);
      separations.push([now - (1000 * 60 * 60 * 24),'in the last day']);
      separations.push([0, 'more than a day ago']);

      function getGroup(time) {
        let limit, text;
        for (let i = 0; i < separations.length; i++) {
          limit = separations[i][0];
          text = separations[i][1];
          if (limit < time) {
            return text;
          }
        }
      }

      const closedTabGroups = [];
      let currentGroup;
      for (let i = 0; i < closedTabs.length; i++) {
        var tab = closedTabs[i];
        var timeGroup = getGroup(tab.closedAt);

        if (timeGroup !== currentGroup) {
          currentGroup = _.findWhere(closedTabGroups, {title: timeGroup});

          if (currentGroup == null) {
            currentGroup = {
              tabs: [],
              title: timeGroup,
            };
            closedTabGroups.push(currentGroup);
          }
        }

        currentGroup.tabs.push(tab)
      }

      this.setState({closedTabGroups});
    };

    setFilter = (event) => {
      const filter = event.target.value;
      this.setState({filter});
      tabmanager.searchTabs(this.setClosedTabs, [tabmanager.filters.keyword(filter)]);
    };

    render() {
      const tableRows = [];
      this.state.closedTabGroups.forEach(closedTabGroup => {
        tableRows.push(
          <ClosedTabGroupHeader
            key={`ctgh-${closedTabGroup.title}`}
            onRestoreAll={this.handleRestoreAllFromGroup}
            title={closedTabGroup.title}
          />
        );

        closedTabGroup.tabs.forEach(tab => {
          tableRows.push(
            <ClosedTabRow
              key={`ctr-${tab.id}`}
              onOpenTab={this.openTab}
              onRemoveTabFromList={this.handleRemoveTabFromList}
              tab={tab}
            />
          );
        });
      });

      const messageElement = this.state.closedTabGroups.length === 0
        ? (
          <div id="autocloseMessage" className="alert alert-info">
            If tabs are closed automatically, they will be stored here
          </div>
        )
        : (
          <button
            className="btn btn-small"
            onClick={this.clearList}
            style={{marginBottom: '20px'}}>
            Clear list
          </button>
        );

      return (
        <div className="tab-pane active" id="tabCorral">
          <form className="form-search">
            <input
              className="span8 corral-search search-query"
              name="search"
              onChange={this.setFilter}
              placeholder="search"
              type="search"
              value={this.state.filter}
            />
          </form>

          <table id="corralTable" className="table-condensed table-striped table table-bordered">
            <thead>
              <tr>
                <th className="faviconCol"><i className="icon-remove"></i></th>
                <th>Title</th>
                <th>Closed</th>
              </tr>
            </thead>
            <tbody>
              {tableRows}
            </tbody>
          </table>

          {messageElement}
        </div>
      );
    }
  }

  class PauseButton extends React.PureComponent {
    constructor() {
      super();

      this.state = {
        paused: settings.get('paused'),
      };
    }

    pause = () => {
      chrome.browserAction.setIcon({path: 'img/icon-paused.png'});
      settings.set('paused', true);
      this.setState({paused: true});
    };

    play = () => {
      chrome.browserAction.setIcon({path: 'img/icon.png'});
      settings.set('paused', false);
      this.setState({paused: false});
    };

    render() {
      const action = this.state.paused
        ? this.play
        : this.pause;

      const content = this.state.paused
        ? <span><i className="icon-play"></i> Play</span>
        : <span><i className="icon-pause"></i> Pause</span>;

      return (
        <button className="btn btn-mini" onClick={action}>
          {content}
        </button>
      );
    }
  }

  class NavBar extends React.PureComponent {
    handleClickCorralTab = (event) => {
      event.preventDefault();
      this.props.onClickTab('corral');
    };

    handleClickLockTab = (event) => {
      event.preventDefault();
      this.props.onClickTab('lock');
    };

    handleClickOptionsTab = (event) => {
      event.preventDefault();
      this.props.onClickTab('options');
    };

    render() {
      return (
        <div>
          <div className="pull-right nav-buttons">
            <PauseButton />{' '}
            <a
              className="btn btn-mini"
              href="https://chrome.google.com/webstore/detail/egnjhciaieeiiohknchakcodbpgjnchh/reviews"
              target="_blank">
              <i className="icon-star"></i> Review Tab Wrangler
            </a>
          </div>
          <ul className="nav nav-tabs">
            <li className={this.props.activeTabId === 'corral' ? 'active' : null}>
              <a href="#" onClick={this.handleClickCorralTab}>Tab Corral</a>
            </li>
            <li className={this.props.activeTabId === 'lock' ? 'active' : null}>
              <a href="#" onClick={this.handleClickLockTab}>Tab Lock</a>
            </li>
            <li className={this.props.activeTabId === 'options' ? 'active' : null}>
              <a href="#" onClick={this.handleClickOptionsTab}>Options</a>
            </li>
          </ul>
        </div>
      );
    }
  }

  class PopupContent extends React.PureComponent {
    constructor() {
      super();
      this.state = {
        activeTabId: 'corral',
      };
    }

    handleClickTab = (tabId) => {
      this.setState({activeTabId: tabId});
    };

    render() {
      let activeTab;
      switch (this.state.activeTabId) {
        case 'corral':
          activeTab = <CorralTab />;
          break;
        case 'lock':
          activeTab = <LockTab />;
          break;
        case 'options':
          activeTab = <OptionsTab />;
          break;
      }

      return (
        <div>
          <NavBar activeTabId={this.state.activeTabId} onClickTab={this.handleClickTab} />
          <div className="tab-content container-fluid">
            {activeTab}
          </div>
        </div>
      );
    }
  }

  ReactDOM.render(
    <PopupContent />,
    document.getElementById('popup')
  );
});
