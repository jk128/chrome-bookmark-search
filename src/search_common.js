var urlGoMatch = /^go (https?|ftp|file|chrome(-extension)?):\/\/.+/i;
var jsGoMatch = /^go javascript:.+/i;
var urlMatch = /^(https?|ftp|file|chrome(-extension)?):\/\/.+/i;
var jsMatch = /^javascript:.+/i;
var urlDomainMatch = /^[a-z]+:\/\/([-.a-z0-9]+)/i;

var matching = {
	'name_fullmatch': {
		'cmp': function(b, q){
			return b.title.toLowerCase() === q.toLowerCase();
		}
	},
	'name_startwith': {
		'cmp': function(b, q){
			return b.title.length >= q.length && b.title.toLowerCase().substr(0, q.length).toLowerCase() === q.toLowerCase();
		}
	},
	'name_contains': {
		'cmp': function(b, q){
			return b.title.length >= q.length && b.title.toLowerCase().indexOf(q.toLowerCase()) !== -1;
		}
	},
	'url_contains': {
		'cmp': function(b, q){
			return ('url' in b) && !jsMatch.test(b.url) && b.url.length >= q.length && b.url.toLowerCase().indexOf(q.toLowerCase()) !== -1;
		}
	},
	'url_domain_contains': {
		'cmp': function(b, q){
			var m;
			if(('url' in b) && !jsMatch.test(b.url) && (m = urlDomainMatch.exec(b.url))){
				return m[1].length >= q.length && m[1].toLowerCase().indexOf(q.toLowerCase()) !== -1;
			}else{
				return false;
			}
		}
	},
	'url_domain_part_match': {
		'cmp': function(b, q){
			var m;
			if(('url' in b) && !jsMatch.test(b.url) && (m = urlDomainMatch.exec(b.url))){
				return m[1].toLowerCase().split(".").indexOf(q.toLowerCase()) !== -1;
			}else{
				return false;
			}
		}
	},
};

var matching_rules = [matching.name_fullmatch, matching.name_startwith, matching.name_contains, matching.url_domain_contains];

var bookmarks = (function(){
	var b = {};
	b.itemEachRecursive = function r(nodeArray, callback){
		var len = nodeArray.length;
		var i;
		for(i = 0; i < len; i++){
			var n = nodeArray[i];
			callback(n);
			if('children' in n){
				r(n.children, callback);
			}
		}
	};
	b.searchSubTrees = function(nodeArray, query, callback){
		var sr = [], i, len = matching_rules.length;
		for(i = 0; i < len; i++){
			sr[i] = [];
		}
		b.itemEachRecursive(nodeArray, function(n){
			if('url' in n){
				for(i = 0; i < len; i++){
					if(matching_rules[i].cmp(n, query)){
						sr[i].push(n);
						return;
					}
				}
			}
		});
		callback(Array.prototype.concat.apply([], sr));
	};
	b.searchAll = function(query, callback){
		chrome.bookmarks.getTree(function(results){
			b.searchSubTrees(results, query, callback);
		});
	};
	b.searchAllSorted = function(query, callback){
		b.searchAll(query, function(rs){
			callback(rs);
		});
	};
	b.search = function(query, algorithm, callback){
		switch(algorithm){
		case "v2":
			b.searchAllSorted(query, callback);
			break;
		// case "builtin":
		default:
			chrome.bookmarks.search(query, callback);
			break;
		}
	};
	return b;
})();

var bookmarksToSuggestions = function(b, s){
	var m = parseInt(localStorage["maxcount"]);
	var i = 0;
	while(s.length < m && i < b.length){
		var v = b[i];
		if(v.title){
			if(jsMatch.test(v.url)){
				s.push({
					'content': "go " + v.url,
					'description': escapeXML(v.title) + "<dim> - JavaScript bookmarklet</dim>"
				});
			}else{
				s.push({
					'content': "go " + v.url,
					'description': escapeXML(v.title) + "<dim> - </dim><url>" + escapeXML(v.url) + "</url>"
				});
			}
		}else{
			if(jsMatch.test(v.url)){
				s.push({
					'content': "go " + v.url,
					'description': "<dim>Unnamed JavaScript bookmarklet - </dim><url>" + escapeXML(v.url) + "</url>"
				});
			}else{
				s.push({
					'content': "go " + v.url,
					'description': "<url>" + escapeXML(v.url) + "</url>"
				});
			}
		}
		i++;
	}
};

var searchInput = function(text, algorithm, suggest, setDefault, setDefaultUrl){
	if(jsGoMatch.test(text)){ // is "go jsbm"
		setDefault({
			'description': "Run JavaScript bookmarklet <url>" + escapeXML(text.substr(3)) + "</url>"
		});
		bookmarks.search(text, algorithm, function(results){
			var s = [];
			s.push({
				'content': "?" + text,
				'description': "Search <match>" + escapeXML(text) + "</match> in Bookmarks"
			});
			bookmarksToSuggestions(results, s);
			suggest(s);
		});
	}else if(urlGoMatch.test(text)){ // is "go addr"
		setDefault({
			'description': "Go to <url>" + escapeXML(text.substr(3)) + "</url>"
		});
		bookmarks.search(text, algorithm, function(results){
			var s = [];
			s.push({
				'content': "?" + text,
				'description': "Search <match>" + escapeXML(text) + "</match> in Bookmarks"
			});
			bookmarksToSuggestions(results, s);
			suggest(s);
		});
	}else if(text == ""){
		setDefaultUrl("");
		setDefault({
			'description': "Please enter keyword to search in Bookmarks"
		});
		suggest([]);
	}else{
		setDefaultUrl("");
		setDefault({
			'description': "Search <match>%s</match> in Bookmarks"
		});
		bookmarks.search(text, algorithm, function(results){
			var s = [];
			bookmarksToSuggestions(results, s);
			// check if no result/single result/full match
			if(s.length == 0){
				setDefaultUrl("");
				setDefault({
					'description': "Opps, no results for <match>%s</match> in Bookmarks!"
				});
			}else if(s.length == 1){
				setDefaultUrl(results[0].url);
				var v = results[0];
				if(v.title){
					if(jsMatch.test(v.url)){
						setDefault({
							'description': escapeXML(v.title) + "<dim> (only match) - JavaScript bookmarklet</dim>"
						});
					}else{
						setDefault({
							'description': escapeXML(v.title) + "<dim> (only match) - </dim><url>" + escapeXML(v.url) + "</url>"
						});
					}
				}else{
					if(jsMatch.test(v.url)){
						setDefault({
							'description': "<dim>Unnamed JavaScript bookmarklet (only match) - </dim><url>" + escapeXML(v.url) + "</url>"
						});
					}else{
						setDefault({
							'description': "<dim>Only match - </dim><url>" + escapeXML(v.url) + "</url>"
						});
					}
				}
				s[0] = {
					'content': "?" + text,
					'description': "Search <match>" + escapeXML(text) + "</match> in Bookmarks"
				};
			}else if(localStorage["matchname"]){
				if(results[0] && results[0].title && results[0].title.toLowerCase() == text.toLowerCase()){
					setDefaultUrl(results[0].url);
					var v = results[0];
					if(jsMatch.test(v.url)){
						setDefault({
							'description': "<match>" + escapeXML(v.title) + "</match><dim> - JavaScript bookmarklet</dim>"
						});
					}else{
						setDefault({
							'description': "<match>" + escapeXML(v.title) + "</match><dim> - </dim><url>" + escapeXML(v.url) + "</url>"
						});
					}
					s[0] = {
						'content': "?" + text,
						'description': "Search <match>" + escapeXML(text) + "</match> in Bookmarks"
					};
				}else{
					setDefaultUrl("");
				}
			}
			suggest(s);
		});
	}
};
