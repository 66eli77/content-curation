var Backbone = require("backbone");
var _ = require("underscore");
var BaseViews = require("edit_channel/views");
var Models = require("edit_channel/models");
var Dropzone = require("dropzone");
var get_cookie = require("utils/get_cookie");
require("uploader.less");
require("dropzone/dist/dropzone.css");

var FileModalView = BaseViews.BaseModalView.extend({
    template: require("./hbtemplates/file_upload_modal.handlebars"),

    initialize: function(options) {
        _.bindAll(this, "close_file_uploader");
        this.callback = options.callback;
        this.parent_view = options.parent_view;
        this.render();
        this.file_upload_view = new FileUploadView({
            el: this.$(".modal-body"),
            callback: this.callback,
            container: this
        });
    },

    render: function() {
        this.$el.html(this.template());
        $("body").append(this.el);
        this.$(".modal").modal({show: true});
        this.$(".modal").on("hide.bs.modal", this.close);
    },
    close_file_uploader:function(){
        console.log("RETURN COLLECTION", this.file_upload_view.returnCollection);
      this.callback(this.file_upload_view.returnCollection);
      this.close();
    }
});

var FileUploadView = BaseViews.BaseListView.extend({
    template: require("./hbtemplates/file_upload.handlebars"),
    file_upload_template: require("./hbtemplates/file_upload_dropzone_item.handlebars"),
    callback:null,
    file_list : [],
    returnCollection: null,
    acceptedFiles : "image/*,application/pdf,video/*,text/*,audio/*",

    initialize: function(options) {
        _.bindAll(this, "file_uploaded",  "submit_files", "all_files_uploaded", "file_added", "file_removed", "go_to_formats", "go_to_upload");
        this.callback = options.callback;
        this.container = options.container;
        this.uploading = true;
        this.file_list = [];
        this.collection = new Models.FileCollection();
        this.returnCollection = new Models.ContentNodeCollection();
        this.collection.fetch();
        this.render();
    },
    events:{
      "click .submit_uploaded_files" : "submit_files",
      "click .go_to_formats" : "go_to_formats",
      "click .go_to_upload" : "go_to_upload"
    },

    render: function() {
        this.nodeCollection = new Models.ContentNodeCollection();
        this.$el.html(this.template({
            uploading:this.uploading
        }));

        if(this.uploading){
            // TODO parameterize to allow different file uploads depending on initialization.
            this.dropzone = new Dropzone(this.$("#dropzone").get(0), {
                clickable: ["#dropzone", ".fileinput-button"],
                acceptedFiles: this.acceptedFiles,
                url: window.Urls.file_upload(),
                previewTemplate:this.file_upload_template(),
                parallelUploads: 20,
                //autoQueue: false, // Make sure the files aren't queued until manually added
                previewsContainer: "#dropzone", // Define the container to display the previews
                headers: {"X-CSRFToken": get_cookie("csrftoken")}
            });
            this.dropzone.on("success", this.file_uploaded);

            // Only enable the submit upload files button once all files have finished uploading.
            this.dropzone.on("queuecomplete", this.all_files_uploaded);

            // Disable the submit upload files button if a new file is added to the queue.
            this.dropzone.on("addedfile", this.file_added);

            this.dropzone.on("removedfile", this.file_removed);
        }
        this.load_content();
    },
    load_content:function(){
        var list = this.$el.find(".file_list");
        var self = this;
        list.html("");
        var items = this.views;
        this.original_count = this.views.length;
        this.views = [];
        items.forEach(function(view){
            var new_format_item = new FormatItem({
                el:  view.$el,
                model: view.model,
                default_file: view.default_file,
                containing_list_view : self,
                thumbnail: view.thumbnail,
                presets : view.presets,
                initial : view.initial
            });
            self.views.push(new_format_item);
            list.append(new_format_item.el);
        });
        if(this.views.length > 0){
            this.enable_next();
        }

    },
    file_uploaded: function(file) {
        console.log("FILE FOUND:", file);
        var new_file_data = {
            "data" : file,
            "filename": JSON.parse(file.xhr.response).filename
        }
        this.file_list.push(new_file_data);
        this.collection.fetch({async:false});

        var fileModel = this.collection.findWhere({
            checksum: new_file_data.filename.split(".")[0],
            contentmetadata : null
        });

        var presets = new Models.FormatPresetCollection();

        window.formatpresets.forEach(function(preset){
            if(preset.get("allowed_formats").indexOf(fileModel.get("file_format")) >= 0){
                var new_slot = preset.clone();
                //new_slot.set("attached_format", null);
                presets.add(new_slot);
            }
        });

        var node = new Models.ContentNodeModel({
            title : new_file_data.data.name.split(".")[0],
            parent : null,
            children : [],
            kind: (presets.models.length > 0) ? presets.models[0].get("kind") : null,
            license: 1,
            total_file_size : 0,
            tags : []
        });
        this.nodeCollection.create(node, {async:false});
        fileModel.set({
            file_size : new_file_data.data.size,
            contentmetadata: node.id
        });

        var new_format_item = new FormatItem({
            el:  $(file.previewTemplate),
            model: node,
            default_file: fileModel,
            containing_list_view : this,
            thumbnail: $(file.previewTemplate).find(".thumbnail_img").attr("src"),
            presets : presets,
            initial:true
        });

        this.views.push(new_format_item);
    },
    disable_submit: function() {
        this.$(".submit_uploaded_files").attr("disabled", "disabled");
    },
    enable_submit: function() {
        this.$(".submit_uploaded_files").removeAttr("disabled");
    },
    disable_next:function(){
        this.$(".go_to_formats").attr("disabled", "disabled");
    },
    enable_next:function(){
        this.$(".go_to_formats").removeAttr("disabled");
    },
    all_files_uploaded: function() {
        this.enable_next();
    },
    file_added: function(file) {
        if(this.original_count > 0 && this.original_count == this.views.length){
            $(file.previewTemplate).before("<hr/>");
        }
        this.disable_next();
    },

    file_removed: function(file) {
        this.file_list.splice(this.file_list.indexOf(file), 1);
        if (this.file_list.length === 0) {
            this.disable_next();
        }
    },
    go_to_formats:function(){
        this.container.$("#formats_step_number").addClass("active_number");
        this.uploading = false;
        this.render();
    },
    go_to_upload:function(){
        this.container.$("#formats_step_number").removeClass("active_number");
        this.uploading = true;
        this.render();
    },
    close_file_uploader:function(){
        this.container.close_file_uploader();
    },
    remove_view: function(view){
        this.views.splice(this.views.indexOf(this), 1);
        view.delete_view();
        if(this.views.length == 0){
            this.disable_next();
        }
    },
    check_completed:function(){
        var self = this;
        this.enable_submit();
        this.views.forEach(function(view){
            if(view.initial){
                self.disable_submit();
            }
        });
    },
    submit_files:function(){
        var self = this;
        this.views.forEach(function(view){
            var files = [];
            view.presets.forEach(function(preset){
                if(preset.attached_format){
                    files.push(preset.attached_format);
                }
            });
            view.model.set("files", files);

            self.returnCollection.add(view.model);
        })
        this.close_file_uploader();
    }
});

var FormatItem = BaseViews.BaseListNodeItemView.extend({
    template: require("./hbtemplates/file_upload_item.handlebars"),
    className: "format_item row",
    files: [],
    format_views:[],
    indent: 0,
    'id': function() {
        return "format_item_" + this.model.filename;
    },

    initialize: function(options) {
        _.bindAll(this, 'assign_default_format', 'toggle_formats', 'remove_item','update_name', 'enable_save');
        this.containing_list_view = options.containing_list_view;
        this.thumbnail = options.thumbnail;
        this.default_file = options.default_file;
        this.files.push(this.default_file);
        this.initial = options.initial;
        this.presets = options.presets;
        this.render();
        this.$(".save_initial_format").attr("disabled", "disabled")
    },
    events: {
        'change .format_options_dropdown' : 'enable_save',
        'click .expand_format_editor' : 'toggle_formats',
        'click .remove_from_dz ' : 'remove_item',
        'keyup .name_content_input': 'update_name',
        'paste .name_content_input': 'update_name',
        'click .save_initial_format' : "assign_default_format"
    },
    render: function() {
        this.presets.sort_by_order();
        this.$el.html(this.template({
            file:this.default_file,
            initial: this.initial,
            presets: this.presets.models,
            thumbnail:this.thumbnail,
            node: this.model
        }));
        var self = this;
        if(!this.initial){
            self.format_views=[];
            this.presets.forEach(function(preset){
                var acceptedFiles = "";
                preset.get("allowed_formats").forEach(function(format){
                    acceptedFiles += window.fileformats.findWhere({extension: format}).get("mimetype") + ",";
                });
                var format_slot = new FormatSlot({
                    preset:preset,
                    model: self.model,
                    file: preset.attached_format,// preset.get("attached_format"),
                    containing_list_view: self.containing_list_view,
                    acceptedFiles: acceptedFiles,
                    container:self,
                    list: self.$(".format_editor_list")
                });
                self.format_views.push(format_slot);
            });
            this.update_count();
        }
        this.$el.data("data", this);
    },
    enable_save:function(){
        this.$el.find(".save_initial_format").removeAttr("disabled");
    },
    assign_default_format:function(){
        this.initial = false;
        var preset = this.presets.get(this.$(".format_options_dropdown").val());
        this.default_file.set({
            contentmetadata: this.model.get("id"),
            preset : preset.get("id")
        });
        preset.attached_format = this.default_file;
        console.log("PRESETTING", preset);
        //this.set_format(this.default_file, );
        this.render();
        this.containing_list_view.check_completed();
    },
    toggle_formats:function(event){
        if(this.$el.find(".expand_format_editor").hasClass("glyphicon-triangle-bottom")){
            this.$el.find(".format_editor_list").slideUp();
            this.$el.find(".expand_format_editor").removeClass("glyphicon-triangle-bottom");
            this.$el.find(".expand_format_editor").addClass("glyphicon-triangle-top");
        }else{
            this.$el.find(".format_editor_list").slideDown();
            this.$el.find(".expand_format_editor").removeClass("glyphicon-triangle-top");
            this.$el.find(".expand_format_editor").addClass("glyphicon-triangle-bottom");
        }
    },
    update_count:function(){
        this.$(".format_counter").html(this.get_count());
    },
    set_format:function(formatModel, preset){
        var assigned_preset = this.presets.get(preset);
        assigned_preset.attached_format = formatModel;
        // assigned_preset.set("attached_format", formatModel);
        if(formatModel){
            formatModel.set("preset", assigned_preset.id);
        }
        console.log("Presets 1: ",this.presets);
    },
    update_name:function(event){
        this.model.set("title", event.target.value);
    },
    enable_submit:function(){
        this.containing_list_view.enable_submit();
    },
    disable_submit:function(){
        this.containing_list_view.disable_submit();
    },
    get_count:function(){
        var self = this;
        var count = 0;
        this.format_views.forEach(function(format){
            if(format.file){
                self.default_file = format.file;
                count++;
            }
        });
        return count;
    }
});

var FormatSlot = BaseViews.BaseListNodeItemView.extend({
    template: require("./hbtemplates/format_item.handlebars"),
    dropzone_template : require("./hbtemplates/format_dropzone_item.handlebars"),
    'id': function() {
        return "format_slot_item_" + this.model.get("id");
    },
    className:"row format_editor_item",
    initialize: function(options) {
        _.bindAll(this, 'remove_item','file_uploaded','file_added','file_removed','all_files_uploaded');
        this.preset = options.preset;
        this.containing_list_view = options.containing_list_view;
        this.file = options.file;
        this.container = options.container;
        this.acceptedFiles = options.acceptedFiles;
        this.list = options.list;
        this.render();
    },
    events: {
        'click .format_editor_remove ' : 'remove_item'
    },
    render: function() {
        this.$el.html(this.template({
            file:this.file,
            preset: this.preset,
            node: this.model,
            id:this.id() + "_" + this.preset.get("id")
        }));
        this.list.append(this.el);
        this.$el.data("data", this);
        this.$el.attr("id", this.id() + "_" + this.preset.get("id"));

        this.container.update_count();
        if(!this.containing_list_view.uploading && !this.file){
            this.create_dropzone();
        }
    },
    create_dropzone:function(){
        var self = this;
        setTimeout(function(){
            var dz_selector="#" + self.$el.attr("id") + "_dropzone";

            var dropzone = new Dropzone(self.$(dz_selector).get(0), {
                   clickable: dz_selector + " .add_format_button",
                   acceptedFiles: self.acceptedFiles,
                   url: window.Urls.file_upload(),
                   previewTemplate:self.dropzone_template(),
                   maxFiles: 1,
                   previewsContainer: dz_selector,
                   headers: {"X-CSRFToken": get_cookie("csrftoken")}
            });
            dropzone.on("success", self.file_uploaded);

            // Only enable the submit upload files button once all files have finished uploading.
            dropzone.on("queuecomplete", self.all_files_uploaded);
            dropzone.on("addedfile", self.file_added);
            dropzone.on("removedfile", self.file_removed);
        }, 1);
    },
    file_uploaded:function(file){
        console.log("Successfully added file!", file);
        this.containing_list_view.collection.fetch({async:false});
        var new_file_data = {
            "data" : file,
            "filename": JSON.parse(file.xhr.response).filename
        }

        this.file = this.containing_list_view.collection.findWhere({
            checksum: new_file_data.filename.split(".")[0],
            contentmetadata : null
        });

        this.file.set({
            file_size : new_file_data.data.size,
            contentmetadata: this.model.get("id"),
            preset : this.preset.get("id")
        });
        this.preset.attached_format = this.file;
        //this.container.set_format(this.file, this.preset);
        this.render();
        console.log("Presets 3: ",this.container.presets);
    },
    file_added: function(file) {
        this.$(".add_format_button").css("display", "none");
        this.containing_list_view.disable_submit();
        console.log("Presets 2: ",this.container.presets);
    },
    file_removed: function(file) {
        this.$(".add_format_button").css("display", "inline");
    },
    remove_item:function(){
        if(this.container.get_count() ===1){
            this.container.initial = true;
            this.container.render();
            console.log(this.container.default_file.get("preset"));
            this.container.$(".format_options_dropdown").val(this.container.default_file.get("preset"));
        }else{
            this.file = null;
        }
        this.preset.attached_format = null;
        this.render();
    },
    enable_submit:function(){
        this.container.enable_submit();
    },
    disable_submit:function(){
        this.container.disable_submit();
    },
    all_files_uploaded:function(){
        this.container.enable_submit();
    }

});

module.exports = {
    FileUploadView:FileUploadView,
    FileModalView:FileModalView
}