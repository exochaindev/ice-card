function fillGroup(group, data, keyOnly) {
  let all = $('.field.' + group);
  all.each(function(i) {
    // TODO: Use a data- field or at least abstract re-use in check
    let field = $(all[i]).attr('name').split('-')[1];
    if (!keyOnly || field == 'key') {
      if (data && data[field]) {
	all[i].value = data[field];
      }
      else {
	all[i].value = '';
      }
    }
  });
}
function check(group) {
  let req = {};
  $('.field.' + group).each(function(i) {
    // entry-name
    let field = $(this).attr('name').split('-')[1];
    req[field] = $(this).val();
  });
  let closest = $.ajax({
    type: 'POST',
    data: req,
    url: '/closest-person.json',
  }).done(function(data) {
    let entry = JSON.parse(data);
    console.log(entry);
    if (entry.error) {
      if (entry.error == "no relevant users found") {
	// We changed it so much it wasn't recognized, the key probably
	// doesn't apply anymore
	// Clear key
	fillGroup(group, '', true);
	$('.search-result.' + group).remove();
	return;
      }
      else {
	throw new Error(entry.error);
	return;
      }
    }
    renderEntry(entry, group);
  });
}
// TODO: This is the sort of thing that a client-side JS library would
// help with. Consider
// Or, at least writing it in HTML as a hidden dummy, then copying out
function renderEntry(entry, group) {
  // Clear old result
  $('.search-result.' + group).remove();
  // Render a whole thing! A little card that connects the entered info
  // to a real person with a real key
  let rendered = $('<div>')
    // Remember group so it can be cleared
    .addClass('search-result')
    .addClass(group);
  for (let key in entry) {
    if (key != 'key') { // Key is invisible
      rendered.append(
	$('<p>').append(
	  entry[key]
	)
      );
    }
  }
  let links = $('<div>')
    .addClass('search-links')
    .addClass(group)
  .append(
    $('<a>')
      .attr('href', 'javascript:void(0)')
      .click(function(e) {
	// Immediately fill the key, whether they want all data filled or not
	fillGroup(group, entry, true);
	$('.field.' + group + '[name="key"]').val(entry.key);
	$('.search-links.' + group).empty().append(
	  $('<a>')
	    .attr('href', 'javascript:void(0)')
	    .click(function(e) {
	      fillGroup(group, entry);
	      rendered.remove();
	    })
	    .append('Fill in this info')
	)
      })
      .append('This is who I mean')
  ).append(' | ').append(
    $('<a>')
      .attr('href', 'javascript:void(0)')
      .click(function(e) {
	fillGroup(group, '', true);
	rendered.remove();
      })
      .append('No, not them')
  );
  rendered.append(links)
  $('.clear-group.' + group).after(rendered);
}
var checkTimeoutId;
function checkTimeout(e) {
  var nonTypeTime = 1000;
  clearTimeout(checkTimeoutId);
  // We set class to the group name so we can do this
  // TODO: Don't bank on this
  let group = e.target.name.split('-')[0];
  checkTimeoutId = setTimeout(function() {
    check(group);
  }, nonTypeTime);
}
function init() {
  $('input').on('input', checkTimeout);
}
$(init);
