(function($) {
  var LogLevel = {
    DEBUG : 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  var LOG_LEVEL = LogLevel.INFO;

  function log(level, msg) {
    if (level >= LOG_LEVEL)
      console.log(msg);
  }

  var Mode = {
    SEASON_2012Q4 : 'season2012Q4',
    ALL_GAMES : 'allGames',
    SEASON_2012Q1_3 : 'season2012Q1_3',
    OLD_TABLE : 'oldTable',
    THIS_WEEK: 'thisWeek',
    TODAY : 'today',
  };

  var seasonTimestamps = {
      'season2012Q4' : {'start': '1346018400000', 'end': '95649030000000'},
      'allGames' : {'start': '0', 'end': '95649030000000'},
      'season2012Q1_3' : {'start': '1324584000000', 'end': '1346018400000'},
      'oldTable' : {'start': '0', 'end': '1324584000000'},
  };

  var DEFAULT_MODE = Mode.SEASON_2012Q4;

  var MILLISECONDS_IN_A_DAY = 1000 * 60 * 60 * 24;

  var columns = [
    'Rank',
    'Name',
    'Games played',
    'Wins',
    'Losses',
    'Winning pct',
    'Goals',
    'Goals per game',
    'TrueSkill',
    'mu',
    'sigma',
  ];

  var leaderboardColumns = _.reject(columns, function(column) { return column == 'mu' || column == 'sigma' });

  var attrFrom = function(column) {
    return column.toLowerCase().replace(/ /g, '_');
  };

  var Player = Backbone.Model.extend({
    defaults: {
      rank: 0,
      name: 'player',
      games_played: 0,
      wins: 0,
      losses: 0,
      winning_pct: 0,
      goals: 0,
      goals_per_game: 0,
      trueskill: 0.0,
      mu: 0.0,
      sigma: 0.0,
    },

    setDynamicAttrs: function() {
      this.attributes.games_played = this.get('wins') + this.get('losses');
      this.attributes.winning_pct = ((this.get('games_played') != 0 ? this.get('wins') / this.get('games_played') : 0) * 100).toFixed(2) + '%';
      this.attributes.goals_per_game = (this.get('games_played') != 0 ? this.get('goals') / this.get('games_played') : 0).toFixed(2);
    },

    initialize: function() {
       _.bindAll(this, 'setDynamicAttrs');
    },
  });

  function playerDelta(one, two) {
     var delta = new Player();
     delta.attributes.name = one.get('name');
     delta.attributes.wins = one.get('wins') - two.get('wins');
     delta.attributes.losses = one.get('losses') - two.get('losses');
     delta.attributes.goals = one.get('goals') - two.get('goals');
     delta.attributes.trueskill = one.get('trueskill') - two.get('trueskill');
     delta.setDynamicAttrs();

     return delta;
  }

  function isChecked(element) {
    return (element.attr('checked') != undefined && element.attr('checked') == 'checked');
  }

  function getMode() {
    if (isChecked($('#season2012Q4'))) return Mode.SEASON_2012Q4;
    if (isChecked($('#season2012Q1_3'))) return Mode.SEASON_2012Q1_3;
    if (isChecked($('#oldTable'))) return Mode.OLD_TABLE;
    if (isChecked($('#today'))) return Mode.TODAY;
    if (isChecked($('#thisWeek'))) return Mode.THIS_WEEK;

    return Mode.ALL_GAMES;
  }

  function isLeaderBoard(mode) {
     return mode == Mode.THIS_WEEK || mode == Mode.TODAY;
  }

  function startOfDay(date) {
     var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
     return start.getTime();
  }

  function startOfWeek(date) {
     var today = startOfDay(date);
     return today - (date.getDay() * MILLISECONDS_IN_A_DAY);
  }

  function getQueryString(mode) {
    if (mode == Mode.THIS_WEEK) {
      return '?startDate=' + seasonTimestamps[DEFAULT_MODE]['start'] + '&endDate=' + startOfWeek(new Date());
    }

    if (mode == Mode.TODAY) {
      return '?startDate=' + seasonTimestamps[DEFAULT_MODE]['start'] + '&endDate=' + startOfDay(new Date());
    }

    return '?startDate=' + seasonTimestamps[mode]['start'] + '&endDate=' + seasonTimestamps[mode]['end'] + '&minReqGames=1';
  }

  function getPlayerListUrl(mode) {
    var url = 'http://rouzbeh.videoplaza.org:8080/player' + getQueryString(mode);
    log(LogLevel.INFO, 'fetching data for ' + mode);
    log(LogLevel.INFO, url);

    return url;
  }

  function copyCollection(orig) {
     var copy = new Backbone.Collection();
     orig.each(function(model) {
        copy.add(new Backbone.Model(model.toJSON()));
     });

     return copy;
  }

  function findPlayer(playerList, name) {
     var foundPlayer;
     playerList.each(function(player) {
        if (name == player.get('name')) {
           foundPlayer = player;
           return false; // stop looping
        }
     });

     return foundPlayer;
  }

  var PlayerList = Backbone.Collection.extend({
    model: Player,
  });

  var PlayerView = Backbone.View.extend({
    tagName: 'tr',

    initialize: function() {
      _.bindAll(this, 'render');
    },

    render: function() {
        log(LogLevel.DEBUG, "rendering item");
      var html = '';

      this.model.setDynamicAttrs();
      _(columns).each(function(column) {
        var tdContents = '';

        if (this.model.has(attrFrom(column))) {
          tdContents = this.model.get(attrFrom(column));
        }

        html += '<td>' + tdContents + '</td>';
      }, this);
      $(this.el).html(html);

      return this;
    }
  });

  var PlayerListView = Backbone.View.extend({
    el: $('#players'),

    fetchAndRender: function() {
       var mode = getMode();

       this.collection = new PlayerList();
       this.collection.url = getPlayerListUrl(isLeaderBoard(mode) ? DEFAULT_MODE : mode);

       var view = this;
       this.collection.fetch({
          success: function(c,r) {
             if (isLeaderBoard(mode))
                view.leaderBoard(view, c);
          },
          error: function(c,r) {
             log(LogLevel.ERROR, 'FAIL' + r);
             window.err=r;
          }
       });
       this.counter = 0;

       // Stats for the leaderboard are displayed differently, so don't render the table on load
       if (!isLeaderBoard(mode)) {
          this.collection.bind('add', this.appendPlayer,this);
          this.collection.bind('all', this.render, this);
          this.collection.bind('refresh', this.render,this);
       }
    },

    initialize: function() {
      _.bindAll(this, 'render', 'appendPlayer');
      log(LogLevel.DEBUG, 'initialize');
      this.fetchAndRender();
    },

    events: {
      'click #season2012Q4': 'fetchAndRender',
      'click #season2012Q1_3': 'fetchAndRender',
      'click #oldTable': 'fetchAndRender',
      'click #allGames': 'fetchAndRender',
      'click #thisWeek': 'fetchAndRender',
      'click #today': 'fetchAndRender',
    },

    render: function() {
      log(LogLevel.DEBUG, 'rendering collection');
      this.$('table').html('');
      this.$('table').append('<thead></thead>');
      this.$('thead', 'table').append('<tr></tr>');
      _(columns).each(function(column) {
        $('tr', 'thead', 'table', this.el).append('<th>' + column + '</th>');
      }, this);

      log(LogLevel.DEBUG, 'rendering items');
      this.$('table').append('<tbody></tbody>');
      _(this.collection.models).each(function(item) {
        this.appendPlayer(item);
      }, this);

      this.$('table').dataTable({'bDestroy': true, 'bFilter': false, 'bPaginate': false});
    },

    appendPlayer: function(item) {
      log(LogLevel.DEBUG, 'appendPlayer');
      var itemView = new PlayerView({
        model: item
      });
      $('tbody', 'table', this.el).append(itemView.render().el);
    },

    leaderBoard: function(view, c) {
       var allGames = copyCollection(c);

       view.collection.url = getPlayerListUrl(getMode());
       view.collection.fetch({
          success: function(c,r) {
             view.calculateLeaderBoard(view, allGames, c);
          },
          error: function(c,r) {
             log(LogLevel.ERROR, 'FAIL' + r);
             window.err=r;
          }
       });
    },

    calculateLeaderBoard: function(view, allGames, gamesExcludingPeriod) {
       var leaders = new Backbone.Collection();
       gamesExcludingPeriod.each(function(player) {
          var one = findPlayer(allGames, player.get('name'));
          if (one != undefined) {
             var delta = playerDelta(one, player);
             if (delta.get('games_played') >= 1)
                leaders.add(delta);
          }
       });

       leaders.models = _.sortBy(leaders.models, function(leader) { return leader.get('trueskill') * -1 }); // sort descending
       leaders.each(function(leader, index) { leader.attributes.rank = index + 1 });
       view.renderLeaderBoard(view, leaders);
    },

    renderLeaderBoard: function(view, leaders) {
       log(LogLevel.DEBUG, 'rendering leaderboard');
       var table = $('table');
       table.html('');

       var header = $('<thead />');
       var headerRow = $('<tr />');
       _.each(leaderboardColumns, function(column) { headerRow.append('<th>' + column + '</th>') });
       header.append(headerRow);

       log(LogLevel.DEBUG, 'rendering leaders');
       var body = $('<tbody />');
       _.each(leaders.models, function(leader) { view.appendLeader(body, leader) });

       table.append(header);
       table.append(body);
    },

    appendLeader: function(element, leader) {
       var row = $('<tr />');
       _.each(leaderboardColumns, function(column) {
          var value = leader.get(attrFrom(column));
          if (column == 'TrueSkill')
             value = value.toFixed(4);

          row.append('<td>' + value + '</td>');
       });
       element.append(row);
    }
  });

  var listView = new PlayerListView();

})(jQuery);